declare global {
  namespace Express {
    interface Request {
      admin?: { id: number; role: string; name: string };
      validQuery?: any;
    }
  }
}

export {};
