const { MongoClient } = require('mongodb');

// MongoDB connection string - set MONGODB_URI in the environment (never commit it)
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'timeclock';

let client;
let db;

// Unique PINs for employees only. The original index also covered admin
// accounts (which have no PIN), so creating a second admin failed with a
// duplicate-key error. Replace it with a partial index once.
async function ensurePinIndex(db) {
  const users = db.collection('users');
  const indexes = await users.indexes();
  const existing = indexes.find((i) => i.name === 'pin_1');
  if (existing && !existing.partialFilterExpression) {
    await users.dropIndex('pin_1');
    console.log('Replacing users.pin index with a partial unique index');
  }
  await users.createIndex(
    { pin: 1 },
    { unique: true, partialFilterExpression: { pin: { $type: 'string' } } }
  );
}

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
    await ensurePinIndex(db);
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
