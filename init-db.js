const { MongoClient } = require('mongodb');

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://timeclockuser:Pckings9$@timeclock.awtl8gt.mongodb.net/?retryWrites=true&w=majority&appName=timeclock';
const DB_NAME = 'timeclock';

let client;
let db;

async function connectDB() {
  try {
    if (db) {
      return db;
    }

    console.log('Connecting to MongoDB...');
    client = new MongoClient(MONGODB_URI);

    await client.connect();
    db = client.db(DB_NAME);
    
    console.log('✅ Connected to MongoDB successfully!');
    
    // Create indexes for better performance
    await db.collection('users').createIndex({ pin: 1 }, { unique: true });
    await db.collection('users').createIndex({ username: 1 }, { unique: true, sparse: true });
    await db.collection('records').createIndex({ pin: 1 });
    await db.collection('records').createIndex({ time: -1 });
    
    console.log('✅ Database indexes created');
    
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

function getDB() {
  if (!db) {
    throw new Error('Database not initialized. Call connectDB() first.');
  }
  return db;
}

async function closeDB() {
  if (client) {
    await client.close();
    db = null;
    client = null;
    console.log('Database connection closed');
  }
}

// If this file is run directly (during build), connect and then close
if (require.main === module) {
  connectDB()
    .then(() => {
      console.log('✅ Database initialization complete');
      return closeDB();
    })
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Database initialization failed:', error);
      process.exit(1);
    });
}

module.exports = {
  connectDB,
  getDB,
  closeDB
};
