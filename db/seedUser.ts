// Seeds (or updates) one admin login, read from .env.
// Use this when you just need a login and don't want to reseed products: npm run db:seed:user
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB, nextId } from '../src/db.js';
import { Admin } from '../src/models/index.js';

async function main() {
  await connectDB();
  const name = process.env.ADMIN_NAME || 'Store Admin';
  const email = (process.env.ADMIN_EMAIL || 'admin@snspices.in').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@123';
  const role = (process.env.ADMIN_ROLE || 'ADMIN') as 'ADMIN' | 'STAFF';
  const hash = await bcrypt.hash(password, 10);

  let admin = await Admin.findOneAndUpdate({ email }, { $set: { name, password: hash, role } }, { new: true });
  if (!admin) {
    const id = await nextId('admin');
    admin = await Admin.create({ id, name, email, password: hash, role });
  }
  console.log('Admin user ready:', { id: admin.id, name: admin.name, email: admin.email, role: admin.role });
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => disconnectDB());
