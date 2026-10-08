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
// Read-only API key for the stats bot / integrations (Authorization: Bearer <key>)
const API_KEY = process.env.TIMECLOCK_API_KEY;
// Public base URL, used for avatar links in Discord. Falls back to the last request's origin.
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
let lastSeenOrigin = '';

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
const IT_REASONS = ['Internet', 'Dialer', 'Headset', 'PC', 'Power outage', 'Other'];

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
app.use(bodyParser.json({ limit: '1mb' })); // avatar uploads are ~30-150KB as base64
app.use((req, res, next) => {
    if (!PUBLIC_URL && req.get('host')) lastSeenOrigin = `${req.protocol}://${req.get('host')}`;
    next();
});
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

// ---------- Avatars ----------
// Stored in the `avatars` collection under a random id (never the PIN), served at /avatars/<id>.jpg

const AVATAR_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_AVATAR_BYTES = 400 * 1024;

function avatarPath(user) {
    return user && user.avatarId ? `/avatars/${user.avatarId}?v=${user.avatarVersion || 1}` : null;
}

function avatarAbsoluteUrl(user) {
    const path = avatarPath(user);
    const base = PUBLIC_URL || lastSeenOrigin;
    return path && base ? base + path : null;
}

function parseImageDataUrl(dataUrl) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
    if (!m) return null;
    const buffer = Buffer.from(m[2], 'base64');
    if (!buffer.length || buffer.length > MAX_AVATAR_BYTES) return null;
    return { contentType: m[1], buffer };
}

async function saveAvatar(db, user, dataUrl) {
    const image = parseImageDataUrl(dataUrl);
    if (!image) {
        const err = new Error('Please upload a JPG, PNG or WebP image under 400KB');
        err.status = 400;
        throw err;
    }
    const avatarId = user.avatarId || crypto.randomBytes(12).toString('hex');
    await db.collection('avatars').updateOne(
        { _id: avatarId },
        { $set: { data: image.buffer, contentType: image.contentType, updatedAt: new Date() } },
        { upsert: true }
    );
    const avatarVersion = (user.avatarVersion || 0) + 1;
    await db.collection('users').updateOne({ _id: user._id }, { $set: { avatarId, avatarVersion } });
    return avatarPath({ avatarId, avatarVersion });
}

async function removeAvatar(db, user) {
    if (user.avatarId) await db.collection('avatars').deleteOne({ _id: user.avatarId });
    await db.collection('users').updateOne({ _id: user._id }, { $unset: { avatarId: '', avatarVersion: '' } });
}

// ---------- PIN guessing protection ----------
// Too many unknown-PIN attempts from one IP within 10 minutes -> temporary block
const PIN_FAIL_LIMIT = 40;
const PIN_FAIL_WINDOW_MS = 10 * 60 * 1000;
const pinFailures = new Map();

function pinBlocked(req) {
    const entry = pinFailures.get(getClientIp(req));
    return !!(entry && entry.count >= PIN_FAIL_LIMIT && Date.now() - entry.first < PIN_FAIL_WINDOW_MS);
}

function notePinFailure(req) {
    const ip = getClientIp(req);
    const entry = pinFailures.get(ip);
    if (!entry || Date.now() - entry.first >= PIN_FAIL_WINDOW_MS) pinFailures.set(ip, { count: 1, first: Date.now() });
    else entry.count++;
    if (pinFailures.size > 5000) pinFailures.clear();
}

const PIN_BLOCKED_MESSAGE = 'Too many incorrect PIN attempts. Please wait a few minutes and try again.';

// Look up an active employee by PIN for agent self-service routes
async function findAgentByPin(req, res) {
    if (pinBlocked(req)) {
        res.status(429).json({ error: PIN_BLOCKED_MESSAGE });
        return null;
    }
    const user = await getDB().collection('users').findOne({ pin: req.body.pin });
    if (!user || user.username) {
        notePinFailure(req);
        res.status(404).json({ error: 'No user with this PIN' });
        return null;
    }
    if (user.active === false) {
        res.status(403).json({ error: 'This PIN is inactive. Please contact your team lead.', inactive: true });
        return null;
    }
    return user;
}

// ---------- Time sheet helpers ----------
// Records store time as a PST wall-clock string: "MM/DD/YYYY, hh:mm:ss AM"

const LATE_AFTER_MINUTES = 7 * 60 + 10; // fallback: clock-ins after 7:10 AM PST are late

// ---------- Late rules (per team, effective from a date) ----------
// Each entry applies from its `from` date (YYYY-MM-DD, Pacific) until the next entry,
// so changing a team's start time never rewrites past reports.
const LATE_LOCATIONS = ['PH', 'EG', 'TJ', 'RS'];
const DEFAULT_LATE_HISTORY = [
    { from: '0000-01-01', rules: { default: LATE_AFTER_MINUTES } },
    // Overseas teams start at 6:30 AM from Oct 8, 2026 -> late after 6:40 AM
    { from: '2026-10-08', rules: { PH: 6 * 60 + 40, EG: 6 * 60 + 40, default: LATE_AFTER_MINUTES } }
];
let lateHistory = DEFAULT_LATE_HISTORY;

function locationOfTags(tags = []) {
    if (tags.includes('MX')) return 'TJ';
    return LATE_LOCATIONS.find(t => tags.includes(t)) || null;
}

function dateKeyToIso(dateKey) {
    const [m, d, y] = dateKey.split('/');
    return `${y}-${m}-${d}`;
}

function lateRulesOn(isoDate) {
    let entry = lateHistory[0];
    for (const e of lateHistory) if (e.from <= isoDate) entry = e;
    return entry.rules;
}

// Minutes after midnight PST after which a first clock-in counts as late
function lateAfterFor(tags, dateKey) {
    const rules = lateRulesOn(dateKeyToIso(dateKey));
    const loc = locationOfTags(tags);
    return (loc && rules[loc] !== undefined ? rules[loc] : rules.default) ?? LATE_AFTER_MINUTES;
}

function currentLateRules(isoToday) {
    const rules = lateRulesOn(isoToday);
    const out = { default: rules.default ?? LATE_AFTER_MINUTES };
    for (const loc of LATE_LOCATIONS) out[loc] = rules[loc] ?? out.default;
    return out;
}

// ---------- Team schedule: auto clock-out, no-show alerts, long-status limits ----------
const SCHEDULE_KEYS = [...LATE_LOCATIONS, 'default'];
const DEFAULT_SCHEDULE = {
    // Minutes after midnight PST. PH/EG shifts end 3:30 PM; most of Mexico leaves 3:30, a few stay to 4:00.
    autoClockOut: { PH: 15 * 60 + 35, EG: 15 * 60 + 35, TJ: 16 * 60, RS: 16 * 60, default: AUTO_CLOCKOUT_HOUR * 60 + AUTO_CLOCKOUT_MINUTE },
    // "Possibly absent" alert to team leads (weekdays). null = off.
    noShowAt: { PH: 6 * 60 + 45, EG: 6 * 60 + 45, TJ: null, RS: null, default: null },
    // Minutes before a status is flagged as too long
    alertLimits: { break: 20, restroom: 15, lunch: 65, itIssue: 30 }
};
let schedule = JSON.parse(JSON.stringify(DEFAULT_SCHEDULE));
let teamLeadWebhook = process.env.TEAM_LEAD_WEBHOOK_URL || '';

function teamValue(map, tags) {
    const loc = locationOfTags(tags);
    return loc && map[loc] !== undefined ? map[loc] : map.default;
}

async function loadSettings() {
    const doc = await getDB().collection('settings').findOne({ _id: 'app' });
    if (doc && Array.isArray(doc.lateHistory) && doc.lateHistory.length) lateHistory = doc.lateHistory;
    if (doc && doc.schedule) {
        for (const key of Object.keys(DEFAULT_SCHEDULE)) {
            schedule[key] = { ...DEFAULT_SCHEDULE[key], ...(doc.schedule[key] || {}) };
        }
    }
    if (doc && doc.teamLeadWebhook) teamLeadWebhook = doc.teamLeadWebhook;
}

// Claim a one-time job (e.g. "noshow|PH|2026-10-08"). Returns false if it already ran.
async function claimJob(id) {
    try {
        await getDB().collection('jobs').insertOne({ _id: id, at: new Date() });
        return true;
    } catch (error) {
        if (error.code === 11000) return false;
        throw error;
    }
}
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

function todayIsoPst() {
    const p = parseRecordTime(getPSTTime());
    const [m, d, y] = p.dateKey.split('/');
    return `${y}-${m}-${d}`;
}

function shiftIsoDays(iso, days) {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function dateKeyRegex(dateKey) {
    return new RegExp('^' + dateKey.replace(/\//g, '\\/'));
}

// Totals for one employee's records on one day (records in insertion order).
// endMinutes: "now" for today, so open segments count up to the current time.
function summarizeDay(events, endMinutes, lateAfter = LATE_AFTER_MINUTES) {
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
        late: firstIn !== null && firstIn > lateAfter,
        lateAfter,
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
    return {
        name: r.name, pin: r.pin, action: r.action, time: r.time, admin_action: !!r.admin_action,
        note: r.note || undefined, reason: r.reason || undefined, details: r.details || undefined
    };
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
// `who` is the employee document (name, avatar, Discord id, tags) or just a name
async function sendDiscordNotification(who, action, time, isAdminAction = false, note = '', extra = {}) {
    const user = typeof who === 'string' ? { name: who } : who;
    const name = user.name;
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
    if (extra.reason) description += `\n**Issue:** ${extra.reason}${extra.details ? ` · ${extra.details}` : ''}`;
    if (user.discordId) description += `\n**Discord:** <@${user.discordId}>`;

    // Add admin indicator and note if this was an admin action
    if (isAdminAction) {
        title = `🔧 ${title} (Admin)`;
        if (note) {
            description += `\n**Note:** ${note}`;
        }
    }

    const avatarUrl = avatarAbsoluteUrl(user);
    const tags = user.tags || [];
    const location = ['PH', 'TJ', 'EG', 'RS'].find(t => tags.includes(t));
    const role = ['Team Lead', 'Closer', 'Jr Closer', 'Dialer', 'Admin'].filter(t => tags.includes(t)).join(' · ');
    const subtitle = [location, role].filter(Boolean).join(' · ');

    const embed = {
        title: title,
        description: description,
        color: config.color,
        timestamp: new Date().toISOString(),
        footer: {
            text: 'Employee Time Clock (PST)'
        }
    };
    if (avatarUrl || subtitle) {
        embed.author = { name: subtitle ? `${name} · ${subtitle}` : name };
        if (avatarUrl) embed.author.icon_url = avatarUrl;
    }
    if (avatarUrl) embed.thumbnail = { url: avatarUrl };

    const discordMessage = {
        embeds: [embed],
        allowed_mentions: { parse: [] } // show Discord names without pinging anyone
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

// ---------- AUTO CLOCK-OUT (per team) ----------
// A once-a-minute check clocks out everyone still working once their team's time has
// passed. Each team runs at most once per day (claimed in the `jobs` collection), so a
// restart or a late wake-up catches up without repeating.
let autoClockOutRunning = false;

function fmtMinutes(m) {
    const h24 = Math.floor(m / 60);
    return `${h24 % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

function nowPst() {
    const parsed = parseRecordTime(getPSTTime());
    return { dateKey: parsed.dateKey, iso: dateKeyToIso(parsed.dateKey), minutes: Math.floor(parsed.minutes) };
}

// Latest record for every employee, plus their user docs
async function latestByEmployee() {
    const db = getDB();
    const [latest, users] = await Promise.all([
        db.collection('records').aggregate([
            { $sort: { _id: -1 } },
            { $group: { _id: '$pin', recordId: { $first: '$_id' }, action: { $first: '$action' }, time: { $first: '$time' }, reason: { $first: '$reason' }, details: { $first: '$details' } } }
        ]).toArray(),
        db.collection('users').find({ username: { $exists: false } }).toArray()
    ]);
    const byPin = Object.fromEntries(users.map(u => [u.pin, u]));
    return latest.filter(l => byPin[l._id]).map(l => ({ ...l, user: byPin[l._id] }));
}

// teams: array of schedule keys to clock out, or null for everyone
async function performAutoClockOut(teams = null) {
    if (autoClockOutRunning) return 0;
    autoClockOutRunning = true;

    try {
        const db = getDB();
        const targets = (await latestByEmployee()).filter(l => {
            if (!WORKING_ACTIONS.includes(l.action) && !l.action.startsWith('Start')) return false;
            if (!teams) return true;
            const loc = locationOfTags(l.user.tags);
            const key = loc && schedule.autoClockOut[loc] !== undefined ? loc : 'default';
            return teams.includes(key);
        });

        if (targets.length === 0) return 0;

        const currentTime = getPSTTime();
        for (const t of targets) {
            const at = teamValue(schedule.autoClockOut, t.user.tags);
            const note = teams ? `Automatic clock-out at ${fmtMinutes(at)} PST` : 'Clocked out by admin (run auto clock-out)';
            try {
                await db.collection('records').insertOne({
                    name: t.user.name,
                    pin: t.user.pin,
                    action: 'ClockOut',
                    time: currentTime,
                    ip: 'AUTO-SYSTEM',
                    admin_action: true,
                    note
                });
                await sendDiscordNotification(t.user, 'ClockOut', currentTime, true, note);
                console.log(`✅ Auto clocked out: ${t.user.name}`);
            } catch (error) {
                console.error(`❌ Failed to auto clock-out ${t.user.name}:`, error);
            }
        }
        console.log(`⏰ Auto clock-out completed: ${targets.length} employee(s)${teams ? ` (${teams.join(', ')})` : ''}`);
        return targets.length;
    } finally {
        autoClockOutRunning = false;
    }
}

async function runDueAutoClockOuts(now) {
    if (!AUTO_CLOCKOUT_ENABLED) return 0;
    const due = [];
    for (const key of SCHEDULE_KEYS) {
        const at = schedule.autoClockOut[key];
        if (at === null || at === undefined || now.minutes < at) continue;
        if (await claimJob(`autoout|${key}|${now.iso}`)) due.push(key);
    }
    return due.length ? performAutoClockOut(due) : 0;
}

// ---------- Team lead alerts (Discord) ----------

async function sendTeamLeadAlert(embed, content) {
    if (!teamLeadWebhook) return false;
    try {
        const response = await fetch(teamLeadWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: content || undefined,
                embeds: [{ footer: { text: 'Employee Time Clock · team lead alert' }, timestamp: new Date().toISOString(), ...embed }],
                allowed_mentions: { parse: [] }
            })
        });
        if (!response.ok) console.error('Team lead alert failed:', response.status, response.statusText);
        return response.ok;
    } catch (error) {
        console.error('Team lead alert error:', error);
        return false;
    }
}

const LONG_STATUS = {
    StartBreak: { key: 'break', label: 'on break', emoji: '☕' },
    StartLunch: { key: 'lunch', label: 'at lunch', emoji: '🍔' },
    StartRestroom: { key: 'restroom', label: 'on a restroom break', emoji: '🚻' },
    StartItIssue: { key: 'itIssue', label: 'reporting an IT issue', emoji: '💻' }
};

async function checkLongStatuses(now) {
    for (const l of await latestByEmployee()) {
        const kind = LONG_STATUS[l.action];
        if (!kind || l.user.active === false) continue;
        const limit = schedule.alertLimits[kind.key];
        const started = parseRecordTime(l.time);
        if (!limit || !started || started.dateKey !== now.dateKey) continue;
        const elapsed = Math.floor(now.minutes - started.minutes);
        if (elapsed < limit) continue;
        if (!(await claimJob(`long|${l.recordId}`))) continue;

        const loc = locationOfTags(l.user.tags);
        let description = `**${l.user.name}**${loc ? ` (${loc})` : ''} has been ${kind.label} for **${elapsed} minutes** (limit ${limit}).\nStarted at ${fmtMinutes(Math.floor(started.minutes))} PST.`;
        if (l.reason) description += `\n**Issue:** ${l.reason}${l.details ? ` · ${l.details}` : ''}`;
        if (l.user.discordId) description += `\n**Discord:** <@${l.user.discordId}>`;
        const avatar = avatarAbsoluteUrl(l.user);
        await sendTeamLeadAlert({
            title: `${kind.emoji} Long ${kind.key === 'itIssue' ? 'IT issue' : kind.key}: ${l.user.name}`,
            description,
            color: kind.key === 'itIssue' ? 15158332 : 15844367,
            ...(avatar ? { thumbnail: { url: avatar } } : {})
        });
    }
}

async function checkNoShows(now) {
    const weekday = new Date(`${now.iso}T12:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) return;

    const dueTeams = SCHEDULE_KEYS.filter(key => {
        const at = schedule.noShowAt[key];
        // Only within 2 hours of the alert time, so a late restart doesn't send stale alerts
        return at !== null && at !== undefined && now.minutes >= at && now.minutes < at + 120;
    });
    if (!dueTeams.length) return;

    const db = getDB();
    const [users, todays] = await Promise.all([
        db.collection('users').find({ username: { $exists: false }, active: { $ne: false } }).toArray(),
        db.collection('records').find({ time: dateKeyRegex(now.dateKey) }).toArray()
    ]);
    const seen = new Set(todays.map(r => r.pin));

    for (const key of dueTeams) {
        if (!(await claimJob(`noshow|${key}|${now.iso}`))) continue;
        const missing = users.filter(u => {
            const loc = locationOfTags(u.tags);
            const team = loc && schedule.noShowAt[loc] !== undefined ? loc : 'default';
            return team === key && !seen.has(u.pin) && !(u.tags || []).includes('Admin');
        });
        if (!missing.length) continue;
        const teamName = { PH: 'Philippines', EG: 'Egypt', TJ: 'Tijuana', RS: 'Rosarito', default: 'Other' }[key];
        const base = PUBLIC_URL || lastSeenOrigin;
        await sendTeamLeadAlert({
            title: `⚠️ Possibly absent: ${missing.length} ${teamName} agent${missing.length > 1 ? 's' : ''} not clocked in`,
            description: `Not clocked in by **${fmtMinutes(schedule.noShowAt[key])} PST**:\n` +
                missing.map(u => `• **${u.name}**${u.discordId ? ` (<@${u.discordId}>)` : ''}`).join('\n') +
                (base ? `\n\nMark absent in the [admin portal](${base}) if they're out today.` : ''),
            color: 15105570
        });
    }
}

let scheduleRunning = false;
async function runScheduledJobs() {
    if (scheduleRunning) return;
    scheduleRunning = true;
    try {
        const now = nowPst();
        await runDueAutoClockOuts(now);
        await checkNoShows(now);
        await checkLongStatuses(now);
    } catch (error) {
        console.error('❌ Scheduled job error:', error);
    } finally {
        scheduleRunning = false;
    }
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
        res.json(users.map(u => ({ ...u, avatarUrl: avatarPath(u) })));
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
    if (pinBlocked(req)) return res.status(429).json({ error: PIN_BLOCKED_MESSAGE });

    try {
        const db = getDB();
        const user = await db.collection('users').findOne({ pin }, USER_PROJECTION);

        if (!user || user.username) {
            notePinFailure(req);
            return res.status(404).json({ error: 'No user with this PIN' });
        }
        if (user.active === false) {
            return res.status(403).json({ error: 'This PIN is inactive. Please contact your team lead.', inactive: true });
        }

        const lastRecord = await getLastRecord(db, pin);
        const now = parseRecordTime(getPSTTime());
        const todays = await db.collection('records')
            .find({ pin, time: dateKeyRegex(now.dateKey) }).sort({ _id: 1 }).toArray();
        const lateAfter = lateAfterFor(user.tags, now.dateKey);
        const day = summarizeDay(todays, now.minutes, lateAfter);

        // This week (Monday to today, Pacific) as a personal reference
        const todayIso = dateKeyToIso(now.dateKey);
        const weekday = new Date(`${todayIso}T12:00:00Z`).getUTCDay();
        const weekKeys = dateKeysInRange(shiftIsoDays(todayIso, -((weekday + 6) % 7)), todayIso);
        const week = (await getHours(weekKeys, { pins: [pin] })).employees[0];

        res.json({
            name: user.name,
            action: lastRecord ? lastRecord.action : null,
            time: lastRecord ? lastRecord.time : null,
            today: { firstIn: day.firstIn, worked: day.totals.worked, itIssue: day.totals.itIssue, late: day.late },
            week: week ? {
                worked: week.workedMinutes,
                itIssue: week.itIssueMinutes,
                daysWorked: week.daysWorked,
                lateDays: week.lateDays
            } : null,
            lateAfter,
            avatarUrl: avatarPath(user),
            themePref: user.themePref || null
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
    if (pinBlocked(req)) return res.status(429).json({ error: PIN_BLOCKED_MESSAGE });

    try {
        const db = getDB();
        const user = await db.collection('users').findOne({ pin });
        
        if (!user || user.username) {
            notePinFailure(req);
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

        // IT issues need a reason so leads know what's broken
        let reason, details;
        if (action === 'StartItIssue') {
            reason = req.body.reason;
            if (!IT_REASONS.includes(reason)) {
                return res.status(400).json({ error: 'Please choose what the IT issue is' });
            }
            details = String(req.body.details || '').trim().slice(0, 200) || undefined;
        }

        // Time and IP come from the server, not the browser
        const time = getPSTTime();
        const ip = getClientIp(req);
        const name = user.name;
        const record = { name, pin, action, time, ip };
        if (reason) record.reason = reason;
        if (details) record.details = details;
        const result = await db.collection('records').insertOne(record);

        // Send Discord notification (non-blocking)
        sendDiscordNotification(user, action, time, false, '', { reason, details }).catch(console.error);

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
        sendDiscordNotification(user, 'ClockOut', time, true, note).catch(console.error);

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
    if (pinBlocked(req)) return res.status(429).json({ error: PIN_BLOCKED_MESSAGE });
    
    try {
        const db = getDB();
        
        // Find employee by PIN
        const employee = await db.collection('users').findOne({ pin });
        
        if (!employee || employee.active === false) {
            notePinFailure(req);
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
        const count = await performAutoClockOut(null);
        res.json({ success: true, message: `Clocked out ${count} agent${count === 1 ? '' : 's'}` });
    } catch (error) {
        console.error('Test auto clock-out error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ---------- Agent self-service (identified by PIN) ----------

app.post('/me/avatar', async (req, res) => {
    try {
        const user = await findAgentByPin(req, res);
        if (!user) return;
        const avatarUrl = await saveAvatar(getDB(), user, req.body.image);
        res.json({ avatarUrl });
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message });
    }
});

app.post('/me/avatar/remove', async (req, res) => {
    try {
        const user = await findAgentByPin(req, res);
        if (!user) return;
        await removeAvatar(getDB(), user);
        res.json({ avatarUrl: null });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// themePref: 'auto' follows the holiday theme admins pick, 'classic' always shows the standard look
app.post('/me/preferences', async (req, res) => {
    const { themePref } = req.body;
    if (!['auto', 'classic'].includes(themePref)) {
        return res.status(400).json({ error: 'themePref must be auto or classic' });
    }
    try {
        const user = await findAgentByPin(req, res);
        if (!user) return;
        await getDB().collection('users').updateOne({ _id: user._id }, { $set: { themePref } });
        res.json({ themePref });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- Admin: agent profile ----------

async function findEmployeeForAdmin(pin, res) {
    const user = await getDB().collection('users').findOne({ pin, username: { $exists: false } });
    if (!user) res.status(404).json({ error: 'Employee not found' });
    return user;
}

app.post('/admin/agent-avatar', requireAdmin, async (req, res) => {
    try {
        const user = await findEmployeeForAdmin(req.body.pin, res);
        if (!user) return;
        if (req.body.remove) {
            await removeAvatar(getDB(), user);
            return res.json({ avatarUrl: null });
        }
        res.json({ avatarUrl: await saveAvatar(getDB(), user, req.body.image) });
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message });
    }
});

// Optional Discord user id (numeric "snowflake") so notifications and the stats bot can link agents
app.post('/admin/agent-profile', requireAdmin, async (req, res) => {
    const discordId = String(req.body.discordId || '').trim();
    if (discordId && !/^\d{15,21}$/.test(discordId)) {
        return res.status(400).json({ error: 'Discord ID should be the 17-20 digit number from "Copy User ID" in Discord' });
    }
    try {
        const user = await findEmployeeForAdmin(req.body.pin, res);
        if (!user) return;
        await getDB().collection('users').updateOne(
            { _id: user._id },
            discordId ? { $set: { discordId } } : { $unset: { discordId: '' } }
        );
        res.json({ discordId: discordId || null });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Public avatar images (random ids, needed by Discord to render them)
app.get('/avatars/:id', async (req, res) => {
    if (!/^[a-f0-9]{24}$/.test(req.params.id)) return res.status(404).end();
    try {
        const doc = await getDB().collection('avatars').findOne({ _id: req.params.id });
        if (!doc) return res.status(404).end();
        res.set('Content-Type', doc.contentType);
        res.set('Cache-Control', 'public, max-age=31536000, immutable'); // URLs carry ?v=<version>
        res.send(doc.data.buffer ? Buffer.from(doc.data.buffer) : doc.data);
    } catch (error) {
        res.status(500).end();
    }
});

app.post('/admin/test-alert', requireAdmin, async (req, res) => {
    if (!teamLeadWebhook) return res.status(400).json({ error: 'Add the team lead webhook first' });
    const ok = await sendTeamLeadAlert({
        title: '✅ Time clock alerts are connected',
        description: 'This channel will get long break / lunch / IT issue alerts and morning "possibly absent" alerts.',
        color: 3066993
    });
    if (!ok) return res.status(502).json({ error: 'Discord rejected the message. Check the webhook URL.' });
    res.json({ success: true });
});

// ---------- Settings (holiday theme) ----------
const THEMES = ['default', 'halloween'];

app.get('/settings', async (req, res) => {
    try {
        const doc = await getDB().collection('settings').findOne({ _id: 'app' });
        res.json({
            theme: doc?.theme || 'default',
            themes: THEMES,
            lateRules: currentLateRules(todayIsoPst()),
            schedule,
            itReasons: IT_REASONS,
            teamLeadAlerts: !!teamLeadWebhook
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Body: { theme } and/or { lateRules: { PH: minutes, EG: ..., TJ: ..., RS: ..., default: ... } }
app.post('/settings', requireAdmin, async (req, res) => {
    const { theme, lateRules, schedule: scheduleIn, teamLeadWebhook: webhookIn } = req.body;
    const update = {};

    if (scheduleIn !== undefined) {
        const next = JSON.parse(JSON.stringify(schedule));
        const validMinutes = v => v === null || (Number.isInteger(v) && v >= 0 && v < 24 * 60);
        for (const field of ['autoClockOut', 'noShowAt']) {
            for (const key of SCHEDULE_KEYS) {
                const v = scheduleIn[field]?.[key];
                if (v === undefined) continue;
                if (!validMinutes(v) || (field === 'autoClockOut' && v === null && key === 'default')) {
                    return res.status(400).json({ error: `Invalid ${field} time for ${key}` });
                }
                next[field][key] = v;
            }
        }
        for (const key of Object.keys(DEFAULT_SCHEDULE.alertLimits)) {
            const v = scheduleIn.alertLimits?.[key];
            if (v === undefined) continue;
            if (!Number.isInteger(v) || v < 1 || v > 480) return res.status(400).json({ error: `Invalid alert limit for ${key}` });
            next.alertLimits[key] = v;
        }
        update.schedule = next;
    }

    if (webhookIn !== undefined) {
        const url = String(webhookIn || '').trim();
        if (url && !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url)) {
            return res.status(400).json({ error: 'That doesn\'t look like a Discord webhook URL' });
        }
        update.teamLeadWebhook = url;
    }

    if (theme !== undefined) {
        if (!THEMES.includes(theme)) return res.status(400).json({ error: 'Unknown theme' });
        update.theme = theme;
    }

    if (lateRules !== undefined) {
        const rules = {};
        for (const key of [...LATE_LOCATIONS, 'default']) {
            const v = lateRules[key];
            if (v === undefined) continue;
            if (!Number.isInteger(v) || v < 0 || v >= 24 * 60) {
                return res.status(400).json({ error: `Invalid late time for ${key}` });
            }
            rules[key] = v;
        }
        if (rules.default === undefined) rules.default = currentLateRules(todayIsoPst()).default;
        // New rules take effect today; earlier days keep the rules they were worked under
        const today = todayIsoPst();
        const history = lateHistory.filter(e => e.from < today);
        history.push({ from: today, rules });
        update.lateHistory = history;
    }

    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update' });

    try {
        await getDB().collection('settings').updateOne({ _id: 'app' }, { $set: update }, { upsert: true });
        if (update.lateHistory) lateHistory = update.lateHistory;
        if (update.schedule) schedule = update.schedule;
        if (update.teamLeadWebhook !== undefined) teamLeadWebhook = update.teamLeadWebhook || process.env.TEAM_LEAD_WEBHOOK_URL || '';
        res.json({ theme: update.theme, lateRules: currentLateRules(todayIsoPst()), schedule, teamLeadAlerts: !!teamLeadWebhook });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- Reports (admin portal + stats API) ----------

const EMPLOYEE_FIELDS = { projection: { name: 1, pin: 1, tags: 1, active: 1, avatarId: 1, avatarVersion: 1, discordId: 1 } };
const LOCATION_TAGS = ['PH', 'TJ', 'EG', 'RS'];

function employeeInfo(e) {
    const tags = e.tags || [];
    return {
        name: e.name,
        pin: e.pin,
        tags,
        location: LOCATION_TAGS.find(t => tags.includes(t)) || (tags.includes('MX') ? 'TJ' : null),
        active: e.active !== false,
        avatarUrl: avatarPath(e),
        discordId: e.discordId || null
    };
}

// One day's summary for every active employee (plus anyone inactive who has
// records that day). endMinutes is "now" when dateKey is today.
async function buildDay(db, dateKey, endMinutes) {
    const [employees, records] = await Promise.all([
        db.collection('users').find({ username: { $exists: false } }, EMPLOYEE_FIELDS).toArray(),
        db.collection('records').find({ time: dateKeyRegex(dateKey) }).sort({ _id: 1 }).toArray()
    ]);
    const byPin = groupByPin(records);
    const rows = employees
        .filter(e => e.active !== false || byPin[e.pin])
        .map(e => ({
            ...employeeInfo(e),
            ...summarizeDay(byPin[e.pin] || [], endMinutes, lateAfterFor(e.tags, dateKey)),
            autoClockOut: AUTO_CLOCKOUT_ENABLED ? teamValue(schedule.autoClockOut, e.tags) : null,
            events: (byPin[e.pin] || []).map(publicRecord)
        }));
    return { rows, records };
}

async function getOverview() {
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
        r.lastReason = last && last.action === 'StartItIssue' ? [last.reason, last.details].filter(Boolean).join(' · ') || null : null;
        r.sinceMinutes = parsed && parsed.dateKey === nowParsed.dateKey ? Math.round(parsed.minutes) : null;
        r.staleOpen = !!(last && parsed && parsed.dateKey !== nowParsed.dateKey && last.action !== 'ClockOut' && last.action !== 'Absent');
        delete r.events;
    });

    return {
        now,
        nowMinutes: Math.round(nowParsed.minutes),
        lateAfterMinutes: LATE_AFTER_MINUTES,
        autoClockOut: AUTO_CLOCKOUT_ENABLED ? schedule.autoClockOut.default : null,
        alertLimits: schedule.alertLimits,
        employees: rows.filter(r => r.active),
        activity: records.slice(-40).reverse().map(publicRecord)
    };
}

async function getDay(dateKey) {
    const nowParsed = parseRecordTime(getPSTTime());
    const endMinutes = dateKey === nowParsed.dateKey ? nowParsed.minutes : null;
    const { rows } = await buildDay(getDB(), dateKey, endMinutes);
    return { date: dateKey, employees: rows };
}

// Totals per employee over a list of date keys; with perDay, also each day's summary
async function getHours(keys, { pins = null, perDay = false } = {}) {
    const db = getDB();
    const nowParsed = parseRecordTime(getPSTTime());
    const userFilter = { username: { $exists: false }, ...(pins ? { pin: { $in: pins } } : {}) };
    const recordFilter = { time: { $in: keys.map(dateKeyRegex) }, ...(pins ? { pin: { $in: pins } } : {}) };
    const [employees, records] = await Promise.all([
        db.collection('users').find(userFilter, EMPLOYEE_FIELDS).toArray(),
        db.collection('records').find(recordFilter).sort({ _id: 1 }).toArray()
    ]);

    const byPinDay = {};
    for (const r of records) {
        const t = parseRecordTime(r.time);
        if (!t) continue;
        const k = r.pin + '|' + t.dateKey;
        (byPinDay[k] = byPinDay[k] || []).push(r);
    }

    const rows = employees.map(e => {
        const row = { ...employeeInfo(e),
            daysWorked: 0, workedMinutes: 0, breakMinutes: 0, lunchMinutes: 0, meetingMinutes: 0, itIssueMinutes: 0,
            lateDays: 0, absentDays: 0, missingClockOuts: 0 };
        if (perDay) row.days = [];
        for (const key of keys) {
            const events = byPinDay[e.pin + '|' + key];
            if (!events) continue;
            const day = summarizeDay(events, key === nowParsed.dateKey ? nowParsed.minutes : null, lateAfterFor(e.tags, key));
            if (day.absent) row.absentDays++;
            if (day.firstIn !== null) row.daysWorked++;
            if (day.late) row.lateDays++;
            if (day.openAtEnd && key !== nowParsed.dateKey) row.missingClockOuts++;
            row.workedMinutes += day.totals.worked;
            row.breakMinutes += day.totals.break + day.totals.restroom;
            row.lunchMinutes += day.totals.lunch;
            row.meetingMinutes += day.totals.meeting;
            row.itIssueMinutes += day.totals.itIssue;
            if (perDay) row.days.push({ date: key, ...day });
        }
        return row;
    }).filter(r => pins || r.active || r.daysWorked || r.absentDays);

    return { start: keys[0], end: keys[keys.length - 1], days: keys.length, employees: rows };
}

const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message });
    }
};

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

function rangeKeys(query) {
    const keys = dateKeysInRange(query.start, query.end || query.start);
    if (!keys) throw badRequest('start/end must be YYYY-MM-DD, at most 93 days apart');
    return keys;
}

// Admin portal
app.get('/admin/overview', requireAdmin, handle(async (req, res) => res.json(await getOverview())));

app.get('/admin/day', requireAdmin, handle(async (req, res) => {
    const dateKey = isoToDateKey(req.query.date);
    if (!dateKey) throw badRequest('date must be YYYY-MM-DD');
    res.json(await getDay(dateKey));
}));

app.get('/admin/hours', requireAdmin, handle(async (req, res) => res.json(await getHours(rangeKeys(req.query)))));

// ---------- Read-only stats API (Authorization: Bearer <TIMECLOCK_API_KEY>) ----------
// See docs/API.md. Responses never include PINs.

function requireApiKey(req, res, next) {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : (req.get('x-api-key') || '');
    if (!API_KEY) return res.status(503).json({ error: 'API is not enabled (TIMECLOCK_API_KEY not set)' });
    const a = Buffer.from(token), b = Buffer.from(API_KEY);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Invalid API key' });
    next();
}

// Deep copy without PINs; avatar paths become absolute URLs
function forApi(value) {
    if (Array.isArray(value)) return value.map(forApi);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (k === 'pin') continue;
            out[k] = k === 'avatarUrl' && v ? (PUBLIC_URL || lastSeenOrigin) + v : forApi(v);
        }
        return out;
    }
    return value;
}

const apiJson = (res, data) => res.json(forApi(data));

app.use('/api/v1', cors({ origin: true, credentials: false }), requireApiKey);

app.get('/api/v1/status', handle(async (req, res) => apiJson(res, await getOverview())));

app.get('/api/v1/agents', handle(async (req, res) => {
    const users = await getDB().collection('users').find({ username: { $exists: false } }, EMPLOYEE_FIELDS).toArray();
    const includeInactive = req.query.includeInactive === 'true';
    apiJson(res, { agents: users.map(employeeInfo).filter(a => includeInactive || a.active).sort((a, b) => a.name.localeCompare(b.name)) });
}));

app.get('/api/v1/day', handle(async (req, res) => {
    const dateKey = isoToDateKey(req.query.date || todayIsoPst());
    if (!dateKey) throw badRequest('date must be YYYY-MM-DD');
    apiJson(res, await getDay(dateKey));
}));

app.get('/api/v1/hours', handle(async (req, res) => apiJson(res, await getHours(rangeKeys(req.query)))));

// One agent by name (case-insensitive), with a day-by-day breakdown
app.get('/api/v1/agents/:name', handle(async (req, res) => {
    const name = String(req.params.name).trim();
    const user = await getDB().collection('users').findOne(
        { username: { $exists: false }, name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        EMPLOYEE_FIELDS
    );
    if (!user) return res.status(404).json({ error: `No agent named ${name}` });
    const today = todayIsoPst();
    const keys = rangeKeys({ start: req.query.start || shiftIsoDays(today, -6), end: req.query.end || today });
    const [hours, last] = await Promise.all([getHours(keys, { pins: [user.pin], perDay: true }), getLastRecord(getDB(), user.pin)]);
    apiJson(res, {
        ...hours.employees[0],
        start: hours.start,
        end: hours.end,
        currentStatus: last ? { action: last.action, since: last.time } : null
    });
}));

// Scheduled-jobs trigger for an external scheduler (only needed if the server can sleep)
app.post('/cron/auto-clockout', async (req, res) => {
    if (!CRON_SECRET || req.get('x-cron-secret') !== CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    await runScheduledJobs();
    res.json({ success: true });
});

// Start server after DB connection
connectDB().then(loadSettings).then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`🕐 Server time zone: PST (America/Los_Angeles)`);
        console.log(`🕐 Current PST time: ${getPSTTime()}`);
        
        // Auto clock-out + team lead alerts, checked every minute
        setInterval(runScheduledJobs, 60000);
        setTimeout(runScheduledJobs, 5000); // catch up right after a deploy/restart
        console.log(`⏰ Auto clock-out ${AUTO_CLOCKOUT_ENABLED ? 'by team: ' + SCHEDULE_KEYS.map(k => `${k} ${schedule.autoClockOut[k] != null ? fmtMinutes(schedule.autoClockOut[k]) : 'off'}`).join(', ') : 'DISABLED'}`);
        console.log(`🔔 Team lead alerts ${teamLeadWebhook ? 'on' : 'off (no webhook set)'}`);
    });
}).catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});

// Export the app for compatibility
module.exports = app;
