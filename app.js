const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { usersDB, recordsDB } = require('./init-db.js');
const json2csv = require('json2csv').parse;
const path = require('path');
const cors = require('cors');
const session = require('express-session');

// Secret key for session, randomly generated
let SECRET_KEY = crypto.randomBytes(32).toString('hex');

// Create the Express app
const app = express();
const PORT = process.env.PORT || 3001;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL; // Add this as environment variable in Render

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
        secure: true,
    }
}));

let requireAdmin = (req, res, next) => {
    if (!req.session || req.session.admin !== true)
        return res.status(403).json({ error: 'Admin privileges required' });
    next();
};

// Function to send Discord notification
async function sendDiscordNotification(name, action, time) {
    if (!DISCORD_WEBHOOK_URL) {
        console.log('Discord webhook not configured, skipping notification');
        return;
    }

    // Map actions to emojis and colors
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

    const discordMessage = {
        embeds: [{
            title: `${config.emoji} ${name} ${config.text}`,
            description: `**Time:** ${time}`,
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

// Route to get records by PIN
app.post('/get-records', (req, res) => {
    recordsDB.find({}, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Route to get all users
app.post('/get-users', (req, res) => {
    usersDB.find({}, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Route to download records as CSV
app.post('/download-records', (req, res) => {
    recordsDB.find({}, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const fields = ['name', 'pin', 'action', 'time', 'ip'];
        const opts = { fields };
        const csv = json2csv(rows, opts);
        res.setHeader('Content-disposition', 'attachment; filename=records.csv');
        res.set('Content-Type', 'text/csv');
        res.status(200).send(csv);
    });
});

// Route to add record
app.post('/add-record', async (req, res) => {
    const { pin, action, time, ip } = req.body;
    
    usersDB.findOne({ pin }, async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(400).json({ error: 'No user with this PIN' });
        
        const name = user.name;
        
        recordsDB.insert({ name, pin, action, time, ip }, async (err, newRecord) => {
            if (err) return res.status(500).json({ error: err.message });

            // Send Discord notification (non-blocking)
            sendDiscordNotification(name, action, time).catch(console.error);

            res.status(201).json({ id: newRecord._id, name });
        });
    });
});

// Route to login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    usersDB.findOne({ username }, (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'No user with those credentials' });
        const passwordIsValid = bcrypt.compareSync(password, user.password);
        if (!passwordIsValid) return res.status(401).json({ error: 'Invalid credentials' });

        req.session.admin = true;
        req.session.save(err => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
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

// Route to add user
app.post('/add-admin', (req, res) => {
    const { username, password } = req.body;
    usersDB.findOne({ username }, (err, existingUser) => {
        if (err) return res.status(500).json({ error: err.message });
        if (existingUser) return res.status(400).json({ error: 'Username already exists' });
        const hashedPassword = bcrypt.hashSync(password, 8);
        const loginToken = crypto.randomBytes(16).toString('hex');
        usersDB.insert({ username, password: hashedPassword, loginToken: loginToken }, (err, newUser) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: newUser._id, token: loginToken });
        });
    });
});

// Route to add employee
app.post('/add-employee', (req, res) => {
    const { name, pin } = req.body;
    usersDB.findOne({ pin }, (err, existingEmployee) => {
        if (err) return res.status(500).json({ error: err.message });
        if (existingEmployee) return res.status(400).json({ error: 'PIN already exists' });
        usersDB.insert({ name, pin }, (err, newEmployee) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: newEmployee._id });
        });
    });
});

// Always start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

// Export the app for compatibility
module.exports = app;
module.exports.db = {
    usersDB,
    recordsDB
};
