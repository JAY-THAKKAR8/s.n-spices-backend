import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin/index.js';

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET missing in .env');
  process.exit(1);
}

const app = express();

app.use(helmet());
app.use(cors({ origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(','), credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// stop spam on forms
app.use(['/api/orders', '/api/b2b-inquiries', '/api/admin/login'], rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);

app.use((_req, res) => res.status(404).json({ message: 'Not found' }));

// one error handler for all
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ message: status >= 500 ? 'Something went wrong' : err.message });
});

const port = Number(process.env.PORT || 5001);
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
