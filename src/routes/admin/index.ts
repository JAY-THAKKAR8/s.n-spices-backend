import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Admin } from '../../models/index.js';
import { asyncH, HttpError } from '../../lib/utils.js';
import { requireAdmin } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import dashboard from './dashboard.js';
import orders from './orders.js';
import products from './products.js';
import stock from './stock.js';
import customers from './customers.js';
import misc from './misc.js';

const r = Router();

r.post('/login', validate(z.object({ email: z.string().email(), password: z.string().min(1) })), asyncH(async (req, res) => {
  const a = await Admin.findOne({ email: req.body.email.toLowerCase() }).lean();
  if (!a || !(await bcrypt.compare(req.body.password, a.password))) throw new HttpError(401, 'Wrong email or password');
  const token = jwt.sign({ id: a.id, role: a.role, name: a.name }, process.env.JWT_SECRET as string, { expiresIn: '7d' });
  res.json({ token, admin: { id: a.id, name: a.name, email: a.email, role: a.role } });
}));

r.use(requireAdmin);

r.get('/me', asyncH(async (req, res) => {
  const a = await Admin.findOne({ id: req.admin!.id }, { id: 1, name: 1, email: 1, role: 1 }).lean();
  if (!a) throw new HttpError(401, 'Account removed');
  res.json(a);
}));

r.post('/me/password', validate(z.object({ current: z.string().min(1), next: z.string().min(8, 'Use at least 8 characters') })), asyncH(async (req, res) => {
  const a = await Admin.findOne({ id: req.admin!.id });
  if (!a || !(await bcrypt.compare(req.body.current, a.password))) throw new HttpError(400, 'Current password is wrong');
  a.password = await bcrypt.hash(req.body.next, 10);
  await a.save();
  res.json({ ok: true });
}));

r.use(dashboard);
r.use('/orders', orders);
r.use('/products', products);
r.use('/stock', stock);
r.use('/customers', customers);
r.use(misc);

export default r;
