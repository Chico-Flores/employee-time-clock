const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { connectDB, getDB } = require('./init-db.js');
const json2csv = require('json2csv').parse;
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');

// Secret key for session. Set SESSION_SECRET so admin sessions survive restarts.
const SECRET_KEY = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
    console.warn('⚠️ SESSION_SECRET not set - admins will be logged out whenever the server restarts');
}

// Create the Express app
const app = express();
const PORT = process.env.PORT || 3001;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const ABSENCE_WEBHOOK_URL = process.env.ABSENCE_WEBHOOK_URL;
// Shared secret for the scheduled auto clock-out job (see .github/workflows/auto-clockout.yml)
const CRON_SECRET = process.env.CRON_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'timeclock';

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is required');
    process.exit(1);
}

// Actions an employee can record, and the last action each one may follow.
// undefined = no records yet, 'absent' = last record was an absence.
const VALID_TRANSITIONS = {
    ClockIn: ['ClockOut', 'Absent', undefined],
    ClockOut: ['ClockIn', 'EndBreak', 'EndRestroom', 'EndLunch', 'EndItIssue', 'EndMeeting'],
    StartBreak: ['ClockIn', 'EndRestroom', 'EndLunch', 'EndItIssue', 'EndMeeting'],
    EndBreak: ['StartBreak'],
    StartRestroom: ['ClockIn', 'EndBreak', 'EndRestroom', 'EndLunch', 'EndItIssue', 'EndMeeting'],
    EndRestroom: ['StartRestroom'],
    StartLunch: ['ClockIn', 'EndBreak', 'EndRestroom', 'EndItIssue', 'EndMeeting'],
    EndLunch: ['StartLunch'],
    StartItIssue: ['ClockIn', 'EndBreak', 'EndRestroom', 'EndLunch', 'EndMeeting'],
    EndItIssue: ['StartItIssue'],
    StartMeeting: ['ClockIn', 'EndBreak', 'EndRestroom', 'EndLunch', 'EndItIssue'],
    EndMeeting: ['StartMeeting']
};
const WORKING_ACTIONS = ['ClockIn', 'EndBreak', 'EndRestroom', 'EndLunch', 'EndItIssue', 'EndMeeting'];

// Fields never sent to the browser
const USER_PROJECTION = { projection: { password: 0, loginToken: 0 } };

// AUTO CLOCK-OUT CONFIGURATION
const AUTO_CLOCKOUT_ENABLED = process.env.AUTO_CLOCKOUT_ENABLED !== 'false'; // Default: enabled
const AUTO_CLOCKOUT_HOUR = parseInt(process.env.AUTO_CLOCKOUT_HOUR || '16'); // Default: 4 PM (16:00)
const AUTO_CLOCKOUT_MINUTE = parseInt(process.env.AUTO_CLOCKOUT_MINUTE || '30'); // Default: 30 minutes

const corsOptions = {
    origin: true,
    credentials: true,
    optionsSuccessStatus: 204
};
app.set('trust proxy', 1); // Render sits behind a proxy; needed for real client IPs
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Use session middleware with MongoDB store - MUST come after CORS
const sessionStore = MongoStore.create({
    mongoUrl: MONGODB_URI,
    dbName: DB_NAME,
    collectionName: 'sessions',
    touchAfter: 24 * 3600 // lazy session update (seconds)
    // No `crypto` option: its secret-complexity check rejected random hex secrets
    // and broke admin login. Sessions only hold the admin flag/name.
});

// Handle session store errors
sessionStore.on('error', (error) => {
    console.error('Session store error:', error);
});

app.use(session({
    secret: SECRET_KEY,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        httpOnly: true,
        secure: false, // set to true if using HTTPS
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
    rolling: true, // Reset maxAge on every request
    name: 'timeclock.sid' // Custom session name
}));

let requireAdmin = (req, res, next) => {
    if (!req.session || req.session.admin !== true) {
        return res.status(403).json({ error: 'Admin privileges required' });
    }
    next();
};

// Client IP as seen by the server (replaces the browser-side ipify lookup)
function getClientIp(req) {
    return req.ip || 'unknown';
}

// Most recent record for one employee. _id order is insertion order, which is
// reliable, unlike the 'time' field which is stored as a formatted string.
async function getLastRecord(db, pin) {
    return db.collection('records').findOne({ pin }, { sort: { _id: -1 } });
}

// ---------- Time sheet helpers ----------
// Records store time as a PST wall-clock string: "MM/DD/YYYY, hh:mm:ss AM"

const LATE_AFTER_MINUTES = 7 * 60 + 10; // clock-ins after 7:10 AM PST are late
const BREAK_TYPES = { StartBreak: 'break', StartLunch: 'lunch', StartRestroom: 'restroom', StartMeeting: 'meeting', StartItIssue: 'itIssue' };

function parseRecordTime(str) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)/i.exec(str || '');
    if (!m) return null;
    let hour = parseInt(m[4], 10) % 12;
    if (m[7].toUpperCase() === 'PM') hour += 12;
    return {
        dateKey: `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`,
        minutes: hour * 60 + parseInt(m[5], 10) + (parseInt(m[6] || '0', 10) / 60)
    };
}

// 'YYYY-MM-DD' -> 'MM/DD/YYYY'
function isoToDateKey(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${m[2]}/${m[3]}/${m[1]}` : null;
}

function dateKeysInRange(startIso, endIso) {
    const start = new Date(`${startIso}T12:00:00Z`);
    const end = new Date(`${endIso}T12:00:00Z`);
    if (isNaN(start) || isNaN(end) || end < start) return null;
    const keys = [];
    for (let d = start; d <= end && keys.length <= 93; d = new Date(d.getTime() + 86400000)) {
        keys.push(isoToDateKey(d.toISOString().slice(0, 10)));
    }
    return keys.length > 93 ? null : keys;
}

function dateKeyRegex(dateKey) {
    return new RegExp('^' + dateKey.replace(/\//g, '\\/'));
}

// Totals for one employee's records on one day (records in insertion order).
// endMinutes: "now" for today, so open segments count up to the current time.
function summarizeDay(events, endMinutes) {
    const totals = { worked: 0, break: 0, lunch: 0, restroom: 0, meeting: 0, itIssue: 0 };
    let workStart = null, pauseStart = null, pauseType = null;
    let firstIn = null, lastOut = null, absent = false, lastMinutes = null;

    for (const e of events) {
        const t = parseRecordTime(e.time);
        if (!t) continue;
        const min = t.minutes;
        lastMinutes = min;
        if (e.action === 'Absent') { absent = true; continue; }
        if (e.action === 'ClockIn') {
            if (firstIn === null) firstIn = min;
            workStart = min;
        } else if (BREAK_TYPES[e.action]) {
            if (workStart !== null) totals.worked += min - workStart;
            workStart = null;
            pauseStart = min;
            pauseType = BREAK_TYPES[e.action];
        } else if (e.action.startsWith('End')) {
            if (pauseStart !== null) totals[pauseType] += min - pauseStart;
            pauseStart = null;
            workStart = min;
        } else if (e.action === 'ClockOut') {
            if (workStart !== null) totals.worked += min - workStart;
            if (pauseStart !== null) totals[pauseType] += min - pauseStart;
            workStart = null;
            pauseStart = null;
            lastOut = min;
        }
    }

    // Still open at the end of the day / now
    const end = endMinutes !== null ? endMinutes : lastMinutes;
    if (workStart !== null && end !== null) totals.worked += Math.max(0, end - workStart);
    if (pauseStart !== null && end !== null) totals[pauseType] += Math.max(0, end - pauseStart);

    // Meetings and IT issues are still paid, on-the-clock time
    totals.worked += totals.meeting + totals.itIssue;
    for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k]);
    return {
        firstIn: firstIn !== null ? Math.round(firstIn) : null,
        lastOut: lastOut !== null ? Math.round(lastOut) : null,
        late: firstIn !== null && firstIn > LATE_AFTER_MINUTES,
        absent,
        openAtEnd: workStart !== null || pauseStart !== null,
        totals
    };
}

function groupByPin(records) {
    const byPin = {};
    for (const r of records) (byPin[r.pin] = byPin[r.pin] || []).push(r);
    return byPin;
}

function publicRecord(r) {
    return { name: r.name, pin: r.pin, action: r.action, time: r.time, admin_action: !!r.admin_action, note: r.note || undefined };
}

// Helper function to get current PST time as formatted string
function getPSTTime() {
    // Format: MM/DD/YYYY, HH:MM:SS AM/PM. Formatting with timeZone directly
    // gives the right PST time whatever time zone the server runs in.
    return new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

// Function to send Discord notification
async function sendDiscordNotification(name, action, time, isAdminAction = false, note = '') {
    if (!DISCORD_WEBHOOK_URL) {
        console.log('Discord webhook not configured, skipping notification');
        return;
    }

    const actionConfig = {
        'ClockIn': { emoji: '🟢', color: 3066993, text: 'clocked in' },
        'ClockOut': { emoji: '🔴', color: 15158332, text: 'clocked out' },
        'StartBreak': { emoji: '☕', color: 10181046, text: 'started break' },
        'EndBreak': { emoji: '✅', color: 3066993, text: 'ended break' },
        'StartRestroom': { emoji: '🚻', color: 9807270, text: 'started restroom break' },
        'EndRestroom': { emoji: '✅', color: 3066993, text: 'ended restroom break' },
        'StartLunch': { emoji: '🍔', color: 15844367, text: 'started lunch' },
        'EndLunch': { emoji: '✅', color: 3066993, text: 'ended lunch' },
        'StartItIssue': { emoji: '💻', color: 15158332, text: 'reported IT issue' },
        'EndItIssue': { emoji: '✅', color: 3066993, text: 'resolved IT issue' },
        'StartMeeting': { emoji: '📊', color: 3447003, text: 'started meeting' },
        'EndMeeting': { emoji: '✅', color: 3066993, text: 'ended meeting' }
    };

    const config = actionConfig[action] || { emoji: '⚪', color: 9807270, text: action.toLowerCase() };

    let title = `${config.emoji} ${name} ${config.text}`;
    let description = `**Time (PST):** ${time}`;

    // Add admin indicator and note if this was an admin action
    if (isAdminAction) {
        title = `🔧 ${title} (Admin)`;
        if (note) {
            description += `\n**Note:** ${note}`;
        }
    }

    const discordMessage = {
        embeds: [{
            title: title,
            description: description,
            color: config.color,
            timestamp: new Date().toISOString(),
            footer: {
                text: 'Employee Time Clock (PST)'
            }
        }]
    };

    try {
        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(discordMessage)
        });

        if (!response.ok) {
            console.error('Failed to send Discord notification:', response.statusText);
        }
    } catch (error) {
        console.error('Error sending Discord notification:', error);
    }
}

// Function to send absence notification to special webhook
async function sendAbsenceNotification(name, date) {
    if (!ABSENCE_WEBHOOK_URL) {
        console.log('Absence webhook not configured, skipping notification');
        return;
    }

    const discordMessage = {
        content: `@everyone - Admin Reported **${name}** Absent ❌`,
        embeds: [{
            title: `❌ ${name} - Marked Absent`,
            description: `**Date:** ${date}\n**Time Reported:** ${getPSTTime()}`,
            color: 15158332, // Red color
            timestamp: new Date().toISOString(),
            footer: {
                text: 'Employee Time Clock - Absence Report'
            }
        }]
    };

    try {
        const response = await fetch(ABSENCE_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(discordMessage)
        });

        if (!response.ok) {
            console.error('Failed to send absence notification:', response.statusText);
        }
    } catch (error) {
        console.error('Error sending absence notification:', error);
    }
}

// AUTO CLOCK-OUT FUNCTION
// Runs from the in-process timer (exact minute only) and from the scheduled
// /cron/auto-clockout job, which fires even if the server was asleep at 4:30.
// Safe to run more than once: it only clocks out people who are still working.
let autoClockOutRunning = false;

function isPastAutoClockOutTime() {
    const pstDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const minutes = pstDate.getHours() * 60 + pstDate.getMinutes();
    return minutes >= AUTO_CLOCKOUT_HOUR * 60 + AUTO_CLOCKOUT_MINUTE;
}

async function performAutoClockOut() {
    if (autoClockOutRunning) return 0;
    autoClockOutRunning = true;

    try {
        const db = getDB();

        // Latest record per employee, computed in the database instead of loading every record
        const latest = await db.collection('records').aggregate([
            { $sort: { _id: -1 } },
            { $group: { _id: '$pin', name: { $first: '$name' }, action: { $first: '$action' } } }
        ]).toArray();

        const employeesToClockOut = latest
            .filter(r => WORKING_ACTIONS.includes(r.action))
            .map(r => ({ pin: r._id, name: r.name }));

        if (employeesToClockOut.length === 0) {
            console.log('⏰ No employees to auto clock-out');
            return 0;
        }

        console.log(`⏰ Auto clocking out ${employeesToClockOut.length} employee(s)...`);

        const currentTime = getPSTTime();
        const hour12 = AUTO_CLOCKOUT_HOUR % 12 || 12;
        const ampm = AUTO_CLOCKOUT_HOUR < 12 ? 'AM' : 'PM';
        const note = `Automatic clock-out at ${hour12}:${AUTO_CLOCKOUT_MINUTE.toString().padStart(2, '0')} ${ampm} PST`;

        for (const employee of employeesToClockOut) {
            try {
                await db.collection('records').insertOne({
                    name: employee.name,
                    pin: employee.pin,
                    action: 'ClockOut',
                    time: currentTime,
                    ip: 'AUTO-SYSTEM',
                    admin_action: true,
                    note
                });

                await sendDiscordNotification(employee.name, 'ClockOut', currentTime, true, note);

                console.log(`✅ Auto clocked out: ${employee.name}`);
            } catch (error) {
                console.error(`❌ Failed to auto clock-out ${employee.name}:`, error);
            }
        }

        console.log(`⏰ Auto clock-out completed: ${employeesToClockOut.length} employee(s)`);
        return employeesToClockOut.length;
    } catch (error) {
        console.error('❌ Error during auto clock-out:', error);
        throw error;
    } finally {
        autoClockOutRunning = false;
    }
}

// In-process timer check: only fires at the exact configured minute
async function checkAutoClockOutTime() {
    const pstDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    if (pstDate.getHours() !== AUTO_CLOCKOUT_HOUR || pstDate.getMinutes() !== AUTO_CLOCKOUT_MINUTE) {
        return;
    }
    await performAutoClockOut().catch(() => {});
}

// Main route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/index.html'));
});

// NEW ROUTE: Get current PST time
app.get('/get-pst-time', (req, res) => {
    res.json({ time: getPSTTime() });
});

// Route to get records - ADMIN ONLY
app.post('/get-records', requireAdmin, async (req, res) => {
    try {
        const db = getDB();
        const records = await db.collection('records').find({}).toArray();
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to get all users - ADMIN ONLY (password hashes are never returned)
app.post('/get-users', requireAdmin, async (req, res) => {
    try {
        const db = getDB();
        const users = await db.collection('users').find({}, USER_PROJECTION).toArray();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Whether any accounts exist yet (first-run setup shows "Create Admin")
app.get('/has-users', async (req, res) => {
    try {
        const db = getDB();
        const count = await db.collection('users').countDocuments({}, { limit: 1 });
        res.json({ hasUsers: count > 0 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Current status for one PIN - lets the kiosk show the right buttons without
// downloading every record
app.post('/employee-status', async (req, res) => {
    const { pin } = req.body;

    try {
        const db = getDB();
        const user = await db.collection('users').findOne({ pin }, USER_PROJECTION);

        if (!user || user.username) {
            return res.status(404).json({ error: 'No user with this PIN' });
        }
        if (user.active === false) {
            return res.status(403).json({ error: 'This PIN is inactive. Please contact your team lead.', inactive: true });
        }

        const lastRecord = await getLastRecord(db, pin);
        const now = parseRecordTime(getPSTTime());
        const todays = await db.collection('records')
            .find({ pin, time: dateKeyRegex(now.dateKey) }).sort({ _id: 1 }).toArray();
        const day = summarizeDay(todays, now.minutes);
        res.json({
            name: user.name,
            action: lastRecord ? lastRecord.action : null,
            time: lastRecord ? lastRecord.time : null,
            today: { firstIn: day.firstIn, worked: day.totals.worked, late: day.late }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to download records as CSV with optional date filtering - ADMIN ONLY
app.post('/download-records', requireAdmin, async (req, res) => {
    try {
        const db = getDB();
        const { startDate, endDate } = req.query;
        
        // Build query filter. Times are stored as "MM/DD/YYYY, ..." strings, so match
        // each day in the range by prefix (string comparison breaks across years).
        let query = {};
        if (startDate || endDate) {
            const keys = dateKeysInRange(startDate || endDate, endDate || startDate);
            if (!keys) {
                return res.status(400).json({ error: 'Invalid date range (max 93 days)' });
            }
            query = { time: { $in: keys.map(dateKeyRegex) } };
        }

        const records = await db.collection('records').find(query).sort({ _id: 1 }).toArray();
        const fields = ['name', 'pin', 'action', 'time', 'ip', 'admin_action', 'note'];
        const opts = { fields };
        const csv = json2csv(records, opts);
        res.setHeader('Content-disposition', 'attachment; filename=records.csv');
        res.set('Content-Type', 'text/csv');
        res.status(200).send(csv);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to add record
app.post('/add-record', async (req, res) => {
    const { pin, action } = req.body;

    if (!VALID_TRANSITIONS[action]) {
        return res.status(400).json({ error: 'Invalid action' });
    }

    try {
        const db = getDB();
        const user = await db.collection('users').findOne({ pin });
        
        if (!user || user.username) {
            return res.status(400).json({ error: 'No user with this PIN' });
        }
        if (user.active === false) {
            return res.status(403).json({ error: 'This PIN is inactive. Please contact your team lead.' });
        }

        // Validate against the latest stored record so two devices can't
        // create conflicting entries (e.g. double clock-in)
        const lastRecord = await getLastRecord(db, pin);
        const lastAction = lastRecord ? lastRecord.action : undefined;
        if (!VALID_TRANSITIONS[action].includes(lastAction)) {
            return res.status(409).json({
                error: `Can't ${action} right now (current status: ${lastAction || 'none'})`,
                lastAction: lastAction || null
            });
        }

        // Time and IP come from the server, not the browser
        const time = getPSTTime();
        const ip = getClientIp(req);
        const name = user.name;
        const result = await db.collection('records').insertOne({ 
            name, 
            pin, 
            action, 
            time, 
            ip 
        });

        // Send Discord notification (non-blocking)
        sendDiscordNotification(name, action, time).catch(console.error);

        res.status(201).json({ id: result.insertedId, name, time, ip });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// NEW ROUTE: Manual clock out by admin
app.post('/manual-clock-out', requireAdmin, async (req, res) => {
    const { pin, note } = req.body;
    const time = getPSTTime();
    const ip = getClientIp(req);

    try {
        const db = getDB();
        const user = await db.collection('users').findOne({ pin });
        
        if (!user) {
            return res.status(400).json({ error: 'No user with this PIN' });
        }
        
        const name = user.name;
        const recordData = { 
            name, 
            pin, 
            action: 'ClockOut', 
            time, 
            ip,
            admin_action: true
        };

        // Add note only if provided
        if (note && note.trim()) {
            recordData.note = note.trim();
        }

        const result = await db.collection('records').insertOne(recordData);

        // Send Discord notification with admin flag
        sendDiscordNotification(name, 'ClockOut', time, true, note).catch(console.error);

        res.status(201).json({ id: result.insertedId, name });
    } catch (error) {
        console.error('Manual clock-out error:', error);
        res.status(500).json({ error: error.message });
    }
});

// NEW ROUTE: Mark employee absent
app.post('/mark-absent', requireAdmin, async (req, res) => {
    const { pin, date, force } = req.body;
    const ip = getClientIp(req);

    try {
        const db = getDB();
        const user = await db.collection('users').findOne({ pin });
        
        if (!user) {
            return res.status(400).json({ error: 'No user with this PIN' });
        }
        
        const name = user.name;
        
        // Extract just the date part for comparison (MM/DD/YYYY)
        const dateOnly = date.split(',')[0];
        
        // Check if already marked absent on this date
        const existingAbsence = await db.collection('records').findOne({
            pin,
            action: 'Absent',
            time: { $regex: `^${dateOnly.replace(/\//g, '\\/')}` }
        });
        
        if (existingAbsence) {
            return res.status(409).json({ 
                error: `${name} is already marked absent for ${dateOnly}` 
            });
        }
        
        // Check if employee has any other records on this date
        const existingRecords = await db.collection('records').find({
            pin,
            time: { $regex: `^${dateOnly.replace(/\//g, '\\/')}` }
        }).toArray();
        
        if (existingRecords.length > 0 && !force) {
            return res.status(400).json({ 
                warning: `${name} already has ${existingRecords.length} record(s) for ${dateOnly}`,
                existingRecords: existingRecords.map(r => r.action)
            });
        }
        
        // Create absence record
        const recordData = {
            name,
            pin,
            action: 'Absent',
            time: date,
            ip,
            admin_action: true,
            note: 'Marked absent by admin'
        };
        
        const result = await db.collection('records').insertOne(recordData);
        
        // Send absence notification
        sendAbsenceNotification(name, dateOnly).catch(console.error);
        
        res.status(201).json({ id: result.insertedId, name });
    } catch (error) {
        console.error('Mark absent error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Route to login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const db = getDB();
        const user = await db.collection('users').findOne({ username });
        
        if (!user) {
            return res.status(401).json({ error: 'No user with those credentials' });
        }
        
        const passwordIsValid = bcrypt.compareSync(password, user.password);
        
        if (!passwordIsValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        req.session.admin = true;
        req.session.save(err => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// NEW ROUTE: Quick admin login using PIN for employees with "Admin" tag
app.post('/quick-admin-login', async (req, res) => {
    const { pin } = req.body;
    
    try {
        const db = getDB();
        
        // Find employee by PIN
        const employee = await db.collection('users').findOne({ pin });
        
        if (!employee || employee.active === false) {
            return res.status(401).json({ error: 'Invalid PIN' });
        }
        
        // Check if employee has the "Admin" tag
        if (!employee.tags || !employee.tags.includes('Admin')) {
            return res.status(403).json({ 
                error: 'Access denied: Admin tag required for quick admin access' 
            });
        }
        
        // Don't allow if this is an actual admin account (has username)
        if (employee.username) {
            return res.status(403).json({ 
                error: 'Please use username/password login for admin accounts' 
            });
        }

        // Grant admin access via session
        req.session.admin = true;
        req.session.quickAdmin = true; // Flag to indicate this is a quick admin session
        req.session.adminName = employee.name;
        req.session.adminPin = employee.pin;
        
        req.session.save(err => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ error: 'Failed to create session' });
            }
            
            console.log(`✅ Quick admin login: ${employee.name} (PIN: ${pin})`);
            res.json({ 
                success: true,
                name: employee.name
            });
        });
    } catch (error) {
        console.error('Quick admin login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Route to logout
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ error: err.message });
        }
        res.clearCookie('timeclock.sid'); // Clear the session cookie
        res.json({ success: true });
    });
});

// Route to check if user is logged in
app.get('/is-logged-in', (req, res) => {
    // If session exists and admin is true, return logged in
    if (req.session && req.session.admin === true) {
        return res.json({ isLoggedIn: true });
    }
    
    // Otherwise not logged in
    res.json({ isLoggedIn: false });
});

// Route to add admin
// Open only during first-time setup (no admins yet); afterwards an admin must be logged in.
app.post('/add-admin', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const db = getDB();
        const adminCount = await db.collection('users').countDocuments({ username: { $exists: true } }, { limit: 1 });
        const isFirstAdmin = adminCount === 0;

        if (!isFirstAdmin && req.session?.admin !== true) {
            return res.status(403).json({ error: 'Admin privileges required' });
        }

        const existingUser = await db.collection('users').findOne({ username });
        
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        const hashedPassword = bcrypt.hashSync(password, 8);
        const loginToken = crypto.randomBytes(16).toString('hex');
        
        const result = await db.collection('users').insertOne({ 
            username, 
            password: hashedPassword, 
            loginToken: loginToken 
        });

        if (isFirstAdmin) {
            // Log in the admin who just completed setup
            req.session.admin = true;
            return req.session.save(err => {
                if (err) return res.status(500).json({ error: err.message });
                res.status(201).json({ id: result.insertedId });
            });
        }

        res.status(201).json({ id: result.insertedId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to add employee - UPDATED FOR 4-DIGIT PIN
app.post('/add-employee', requireAdmin, async (req, res) => {
    const { name, pin } = req.body;

    // Validate name
    if (!name || name.trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters long' });
    }

    // Validate PIN is exactly 4 digits
    if (!pin || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }

    try {
        const db = getDB();
        const existingEmployee = await db.collection('users').findOne({ pin });
        
        if (existingEmployee) {
            return res.status(400).json({ error: 'PIN already exists' });
        }
        
        const result = await db.collection('users').insertOne({ name, pin });
        res.status(201).json({ id: result.insertedId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// NEW ROUTE: Delete employee - ADMIN ONLY
app.post('/delete-employee', requireAdmin, async (req, res) => {
    const { pin } = req.body;


    try {
        const db = getDB();
        
        // Check if employee exists
        const employee = await db.collection('users').findOne({ pin });
        
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        
        // Don't allow deleting admin accounts
        if (employee.username) {
            return res.status(403).json({ error: 'Cannot delete admin accounts' });
        }
        
        // Delete the employee
        const result = await db.collection('users').deleteOne({ pin });
        
        if (result.deletedCount === 0) {
            return res.status(500).json({ error: 'Failed to delete employee' });
        }
        
        console.log(`Employee deleted: ${employee.name} (PIN: ${pin})`);
        res.status(200).json({ 
            success: true, 
            message: `Employee ${employee.name} deleted successfully`,
            name: employee.name 
        });
    } catch (error) {
        console.error('Delete employee error:', error);
        res.status(500).json({ error: error.message });
    }
});

// NEW ROUTE: Update employee tags - ADMIN ONLY
app.post('/update-employee-tags', requireAdmin, async (req, res) => {
    const { pin, tags } = req.body;


    try {
        const db = getDB();
        
        // Validate tags array
        if (!Array.isArray(tags)) {
            return res.status(400).json({ error: 'Tags must be an array' });
        }
        
        // Update employee with tags
        const result = await db.collection('users').updateOne(
            { pin },
            { $set: { tags: tags } }
        );
        
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        
        console.log(`Employee tags updated: PIN ${pin}, Tags: ${tags.join(', ')}`);
        res.status(200).json({ 
            success: true, 
            message: 'Tags updated successfully'
        });
    } catch (error) {
        console.error('Update tags error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Activate / deactivate an employee - ADMIN ONLY. Inactive employees keep their
// PIN and history but can't clock in and are hidden from dashboards.
app.post('/set-employee-active', requireAdmin, async (req, res) => {
    const { pin, active } = req.body;

    if (typeof active !== 'boolean') {
        return res.status(400).json({ error: 'active must be true or false' });
    }

    try {
        const db = getDB();
        const result = await db.collection('users').updateOne(
            { pin, username: { $exists: false } },
            { $set: { active } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        res.json({ success: true, active });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// NEW ROUTE: Test auto clock-out - ADMIN ONLY
app.post('/test-auto-clockout', requireAdmin, async (req, res) => {
    try {
        console.log('🧪 Manual test of auto clock-out triggered');
        const count = await performAutoClockOut();
        res.json({ success: true, message: `Auto clock-out test completed (${count} clocked out)` });
    } catch (error) {
        console.error('Test auto clock-out error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ---------- Settings (holiday theme) ----------
const THEMES = ['default', 'halloween'];

app.get('/settings', async (req, res) => {
    try {
        const doc = await getDB().collection('settings').findOne({ _id: 'app' });
        res.json({ theme: doc?.theme || 'default', themes: THEMES });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/settings', requireAdmin, async (req, res) => {
    const { theme } = req.body;
    if (!THEMES.includes(theme)) {
        return res.status(400).json({ error: 'Unknown theme' });
    }
    try {
        await getDB().collection('settings').updateOne({ _id: 'app' }, { $set: { theme } }, { upsert: true });
        res.json({ theme });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- Admin reports ----------

// One day's summary for every active employee (plus anyone inactive who has
// records that day). endMinutes is "now" when dateKey is today.
async function buildDay(db, dateKey, endMinutes) {
    const [employees, records] = await Promise.all([
        db.collection('users').find({ username: { $exists: false } }, { projection: { name: 1, pin: 1, tags: 1, active: 1 } }).toArray(),
        db.collection('records').find({ time: dateKeyRegex(dateKey) }).sort({ _id: 1 }).toArray()
    ]);
    const byPin = groupByPin(records);
    const rows = employees
        .filter(e => e.active !== false || byPin[e.pin])
        .map(e => ({
            name: e.name,
            pin: e.pin,
            tags: e.tags || [],
            active: e.active !== false,
            ...summarizeDay(byPin[e.pin] || [], endMinutes),
            events: (byPin[e.pin] || []).map(publicRecord)
        }));
    return { rows, records };
}

// Live view for the admin "Today" screen
app.get('/admin/overview', requireAdmin, async (req, res) => {
    try {
        const db = getDB();
        const now = getPSTTime();
        const nowParsed = parseRecordTime(now);
        const { rows, records } = await buildDay(db, nowParsed.dateKey, nowParsed.minutes);

        // Current status comes from each employee's latest record (may be from an earlier day)
        const latest = await Promise.all(rows.map(r => getLastRecord(db, r.pin)));
        rows.forEach((r, i) => {
            const last = latest[i];
            const parsed = last ? parseRecordTime(last.time) : null;
            r.lastAction = last ? last.action : null;
            r.lastTime = last ? last.time : null;
            r.sinceMinutes = parsed && parsed.dateKey === nowParsed.dateKey ? Math.round(parsed.minutes) : null;
            r.staleOpen = !!(last && parsed && parsed.dateKey !== nowParsed.dateKey && last.action !== 'ClockOut' && last.action !== 'Absent');
            delete r.events;
        });

        res.json({
            now,
            nowMinutes: Math.round(nowParsed.minutes),
            lateAfterMinutes: LATE_AFTER_MINUTES,
            autoClockOut: AUTO_CLOCKOUT_ENABLED ? AUTO_CLOCKOUT_HOUR * 60 + AUTO_CLOCKOUT_MINUTE : null,
            employees: rows.filter(r => r.active),
            activity: records.slice(-40).reverse().map(publicRecord)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Timesheet for one day: ?date=YYYY-MM-DD
app.get('/admin/day', requireAdmin, async (req, res) => {
    const dateKey = isoToDateKey(req.query.date);
    if (!dateKey) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    try {
        const nowParsed = parseRecordTime(getPSTTime());
        const endMinutes = dateKey === nowParsed.dateKey ? nowParsed.minutes : null;
        const { rows } = await buildDay(getDB(), dateKey, endMinutes);
        res.json({ date: dateKey, employees: rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Hours per employee over a date range: ?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get('/admin/hours', requireAdmin, async (req, res) => {
    const keys = dateKeysInRange(req.query.start, req.query.end);
    if (!keys) return res.status(400).json({ error: 'Invalid date range (max 93 days)' });
    try {
        const db = getDB();
        const nowParsed = parseRecordTime(getPSTTime());
        const [employees, records] = await Promise.all([
            db.collection('users').find({ username: { $exists: false } }, { projection: { name: 1, pin: 1, tags: 1, active: 1 } }).toArray(),
            db.collection('records').find({ time: { $in: keys.map(dateKeyRegex) } }).sort({ _id: 1 }).toArray()
        ]);

        const byPinDay = {};
        for (const r of records) {
            const t = parseRecordTime(r.time);
            if (!t) continue;
            const k = r.pin + '|' + t.dateKey;
            (byPinDay[k] = byPinDay[k] || []).push(r);
        }

        const rows = employees.map(e => {
            const row = { name: e.name, pin: e.pin, tags: e.tags || [], active: e.active !== false,
                daysWorked: 0, workedMinutes: 0, breakMinutes: 0, lunchMinutes: 0, lateDays: 0, absentDays: 0, missingClockOuts: 0 };
            for (const key of keys) {
                const events = byPinDay[e.pin + '|' + key];
                if (!events) continue;
                const day = summarizeDay(events, key === nowParsed.dateKey ? nowParsed.minutes : null);
                if (day.absent) row.absentDays++;
                if (day.firstIn !== null) row.daysWorked++;
                if (day.late) row.lateDays++;
                if (day.openAtEnd && key !== nowParsed.dateKey) row.missingClockOuts++;
                row.workedMinutes += day.totals.worked;
                row.breakMinutes += day.totals.break + day.totals.restroom;
                row.lunchMinutes += day.totals.lunch;
            }
            return row;
        }).filter(r => r.active || r.daysWorked || r.absentDays);

        res.json({ start: keys[0], end: keys[keys.length - 1], days: keys.length, employees: rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Scheduled auto clock-out, called by GitHub Actions (see .github/workflows/auto-clockout.yml).
// The workflow runs at two UTC times to cover daylight saving; calls before the
// configured PST time are ignored.
app.post('/cron/auto-clockout', async (req, res) => {
    if (!CRON_SECRET || req.get('x-cron-secret') !== CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!AUTO_CLOCKOUT_ENABLED) {
        return res.json({ skipped: 'Auto clock-out is disabled' });
    }
    if (!isPastAutoClockOutTime()) {
        return res.json({ skipped: `Before ${AUTO_CLOCKOUT_HOUR}:${AUTO_CLOCKOUT_MINUTE.toString().padStart(2, '0')} PST` });
    }

    try {
        const count = await performAutoClockOut();
        res.json({ success: true, clockedOut: count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server after DB connection
connectDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`🕐 Server time zone: PST (America/Los_Angeles)`);
        console.log(`🕐 Current PST time: ${getPSTTime()}`);
        
        // Schedule auto clock-out check
        if (AUTO_CLOCKOUT_ENABLED) {
            // Run every minute to check for auto clock-out time
            setInterval(checkAutoClockOutTime, 60000); // Check every 60 seconds
            console.log(`⏰ Auto clock-out scheduled for ${AUTO_CLOCKOUT_HOUR}:${AUTO_CLOCKOUT_MINUTE.toString().padStart(2, '0')} PST daily`);
        } else {
            console.log('⏰ Auto clock-out is DISABLED');
        }
    });
}).catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});

// Export the app for compatibility
module.exports = app;
