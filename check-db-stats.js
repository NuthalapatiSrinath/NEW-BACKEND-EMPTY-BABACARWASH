/**
 * Database Stats Check Script
 * Checks the size of collections to identify performance bottlenecks
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/bcw';

async function checkDatabaseStats() {
  try {
    console.log('🚀 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URL);
    
    console.log('✅ Connected! Checking database stats...\n');
    
    const db = mongoose.connection.db;
    
    const collections = ['jobs', 'payments', 'customers', 'workers', 'onewashes', 'buildings', 'staff'];
    
    console.log('📊 Document counts per collection:');
    console.log('='.repeat(50));
    
    for (const collName of collections) {
      const count = await db.collection(collName).countDocuments({});
      const size = await db.collection(collName).stats();
      console.log(`${collName.padEnd(15)}: ${count.toLocaleString().padStart(10)} documents | ${(size.size / 1024 / 1024).toFixed(2)} MB`);
    }
    
    console.log('='.repeat(50));
    console.log('\n📈 Checking sample query performance...\n');
    
    // Test a simple query
    const start1 = Date.now();
    await db.collection('jobs').find({ isDeleted: false }).limit(1).toArray();
    console.log(`Simple jobs query: ${Date.now() - start1}ms`);
    
    // Test an aggregation
    const start2 = Date.now();
    await db.collection('jobs').aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray();
    console.log(`Jobs aggregation: ${Date.now() - start2}ms`);
    
    // Test payments aggregation
    const start3 = Date.now();
    await db.collection('payments').aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray();
    console.log(`Payments aggregation: ${Date.now() - start3}ms`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

checkDatabaseStats();
