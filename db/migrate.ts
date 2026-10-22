// Mongo has no schema to migrate. This just makes sure every collection's
// indexes (unique slug/email/sku, etc.) exist. --reset wipes the database (dev only!).
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/db.js';
import '../src/models/index.js';

async function main() {
  await connectDB();
  if (process.argv.includes('--reset')) {
    await mongoose.connection.dropDatabase();
    console.log('Database reset.');
  }
  for (const model of Object.values(mongoose.models)) {
    await model.syncIndexes();
    console.log('Indexes ready:', model.collection.name);
  }
  console.log('Mongo indexes up to date.');
}

main()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => disconnectDB());
