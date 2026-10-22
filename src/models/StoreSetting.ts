import { Schema, model } from 'mongoose';

export interface StoreSettingDoc {
  key: string;
  value: string;
}

const storeSettingSchema = new Schema<StoreSettingDoc>({
  key: { type: String, required: true, unique: true, maxlength: 40 },
  value: { type: String, required: true },
});

export const StoreSetting = model<StoreSettingDoc>('StoreSetting', storeSettingSchema);
