// Validate req.body (or query) with a zod schema
export const validate = (schema, where = 'body') => (req, _res, next) => {
  const r = schema.safeParse(req[where]);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    const err = new Error(msg);
    err.status = 400;
    return next(err);
  }
  req[where === 'body' ? 'body' : 'validQuery'] = r.data;
  next();
};
