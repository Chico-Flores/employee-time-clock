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

// Secret key for session, randomly generated
let SECRET_KEY = crypto.randomBytes(32).toString('hex');

// Create the Express app
const app = express();
const PORT = process.env.PORT || 3001;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://timeclockuser:Pckings9$@timeclock.awtl8gt.mongodb.net/?retryWrites=true&w=majority&appName=timeclock';
const DB_NAME = 'timeclock';

const corsOptions = {
    origin: true,
    credentials: true,
    optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Use session middleware with MongoDB store - MUST come after CORS
app.use(session({
    secret: SECRET_KEY,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: MONGODB_URI,
        dbName: DB_NAME,
        collectionName: 'sessions',
        touchAfter: 24 * 3600 // lazy session update (seconds)
    }),
    cookie: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

let requireAdmin = (req, res, next) => {
    console.log('RequireAdmin check - Session:', req.session);
    console.log('Is admin?', req.session?.admin);
    
    if (!req.session || req.session.admin !== true) {
        console.log('Admin check failed - Unauthorized');
        return res.status(403).json({ error: 'Admin privileges required' });
    }
    
    console.log('Admin check passed');
    next();
};

// Helper function to get current PST time as formatted string
function getPSTTime() {
    const date = new Date();
    
    // Convert to PST (America/Los_Angeles)
    const pstDate = new Date(date.toLocaleString('en-US', { 
        timeZone: 'America/Los_Angeles' 
    }));
    
    // Format: MM/DD/YYYY, HH:MM:SS AM/PM
    return pstDate.toLocaleString('en-US', {
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
    const ABSENCE_WEBHOOK_URL = 'https://discord.com/api/webhooks/1427415703719510020/oHsxDqLHDpPDdHNccOygRh4Ukox4CUFnqPXI0xQ_WoRuDRiaNQM3hWp4GlRSX_r0yqGk';
    
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

// Main route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/index.html'));
});

// NEW ROUTE: Get current PST time
app.get('/get-pst-time', (req, res) => {
    res.json({ time: getPSTTime() });
});

// Route to get records
app.post('/get-records', async (req, res) => {
    try {
        const db = getDB();
        const records = await db.collection('records').find({}).toArray();
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to get all users
app.post('/get-users', async (req, res) => {
    try {
        const db = getDB();
        const users = await db.collection('users').find({}).toArray();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to download records as CSV with optional date filtering
app.post('/download-records', async (req, res) => {
    try {
        const db = getDB();
        const { startDate, endDate } = req.query;
        
        // Build query filter
        let query = {};
        if (startDate || endDate) {
            query = { time: {} };
            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                query.time.$gte = start.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.time.$lte = end.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
            }
        }
        
        const records = await db.collection('records').find(query).toArray();
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
    const { pin, action, time, ip } = req.body;
    
    try {
        const db = getDB();
        const user = await db.collection('users').findOne({ pin });
        
        if (!user) {
            return res.status(400).json({ error: 'No user with this PIN' });
        }
        
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

        res.status(201).json({ id: result.insertedId, name });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// NEW ROUTE: Manual clock out by admin
app.post('/manual-clock-out', requireAdmin, async (req, res) => {
    const { pin, time, ip, note } = req.body;
    
    console.log('Manual clock-out attempt - Session:', req.session);
    
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
    const { pin, date, ip, force } = req.body;
    
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

// Route to logout
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Route to check if user is logged in
app.get('/is-logged-in', (req, res) => {
    console.log('is-logged-in check - Session:', req.session);
    console.log('is-logged-in - Admin?', req.session?.admin);
    res.json({ isLoggedIn: !!req.session.admin });
});

// DEBUG ROUTE: Check session status
app.get('/debug-session', (req, res) => {
    res.json({
        hasSession: !!req.session,
        isAdmin: req.session?.admin,
        sessionID: req.sessionID,
        fullSession: req.session
    });
});

// Route to add admin
app.post('/add-admin', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const db = getDB();
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
        
        res.status(201).json({ id: result.insertedId, token: loginToken });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Route to add employee - UPDATED FOR 4-DIGIT PIN
app.post('/add-employee', async (req, res) => {
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

// Start server after DB connection
connectDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`🕐 Server time zone: PST (America/Los_Angeles)`);
        console.log(`🕐 Current PST time: ${getPSTTime()}`);
    });
}).catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});

// Export the app for compatibility
module.exports = app;
