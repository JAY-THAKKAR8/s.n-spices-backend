import { Schema, model } from 'mongoose';

// Mints sequential numeric ids per collection, so the rest of the app
// (and the frontend) keeps working with plain numbers instead of ObjectId.
interface CounterDoc {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<CounterDoc>({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 },
});

export const Counter = model<CounterDoc>('Counter', counterSchema);
