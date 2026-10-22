import mongoose, { ClientSession } from 'mongoose';
import { Counter } from './models/Counter.js';

// MONGODB_URI keeps <db_username>/<db_password> placeholders; the real
// credentials live in their own env vars and get swapped in here.
function buildConnectionString(): string {
  const uri = process.env.MONGODB_URI as string;
  const username = encodeURIComponent(process.env.MONGODB_USERNAME || '');
  const password = encodeURIComponent(process.env.MONGODB_PASSWORD || '');
  return uri.replace('<db_username>', username).replace('<db_password>', password);
}

export async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(buildConnectionString());
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

// Mints the next sequential id for a collection (admins, products, variants, ...).
// Pass the active session so the allocation is part of the same transaction.
export async function nextId(name: string, session?: ClientSession): Promise<number> {
  const row = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session },
  );
  return row!.seq;
}

// Run fn inside a Mongo transaction. fn gets the session to pass into model calls.
export async function tx<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result!;
  } finally {
    await session.endSession();
  }
}
