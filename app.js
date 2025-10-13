const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { connectDB, getDB } = require('./init-db.js');
const json2csv = require('json2csv').parse;
const path = require('path');
const cors = require('cors');
const session = require('express-session');

// Secret key for session, randomly generated
let SECRET_KEY = crypto.randomBytes(32).toString('hex');

// Create the Express app
const app = express();
const PORT = process.env.PORT || 3001;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const corsOptions = {
    credentials: true,
    optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Use session middleware
app.use(session({
    secret: SECRET_KEY,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
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
    let description = `**Time:** ${time}`;

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
                text: 'Employee Time Clock'
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

// Main route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/index.html'));
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
                query.time.$gte = start.toLocaleString();
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.time.$lte = end.toLocaleString();
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
    res.json({ isLoggedIn: !!req.session.admin });
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
    });
}).catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});

// Export the app for compatibility
module.exports = app;
