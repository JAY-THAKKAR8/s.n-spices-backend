import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../lib/utils.js';

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Login required'));
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET as string) as Express.Request['admin'];
    next();
  } catch {
    next(new HttpError(401, 'Session expired, login again'));
  }
}
