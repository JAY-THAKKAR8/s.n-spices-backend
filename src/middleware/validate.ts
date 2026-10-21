import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

// Validate req.body (or query) with a zod schema
export const validate = (schema: ZodSchema, where: 'body' | 'query' = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const r = schema.safeParse((req as any)[where]);
    if (!r.success) {
      const msg = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      const err: any = new Error(msg);
      err.status = 400;
      return next(err);
    }
    if (where === 'body') req.body = r.data;
    else req.validQuery = r.data;
    next();
  };
