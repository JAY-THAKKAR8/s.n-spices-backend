// Seeds (or updates) one admin login, read from .env.
// Use this when you just need a login and don't want to reseed products: npm run db:seed:user
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool, one } from '../src/db.js';

async function main() {
  const name = process.env.ADMIN_NAME || 'Store Admin';
  const email = (process.env.ADMIN_EMAIL || 'admin@snspices.in').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@123';
  const role = process.env.ADMIN_ROLE || 'ADMIN';
  const hash = await bcrypt.hash(password, 10);

  const row: any = await one(
    `INSERT INTO admins (name, email, password, role) VALUES ($1,$2,$3,$4)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password = EXCLUDED.password, role = EXCLUDED.role
     RETURNING id, name, email, role`,
    [name, email, hash, role],
  );
  console.log('Admin user ready:', row);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
