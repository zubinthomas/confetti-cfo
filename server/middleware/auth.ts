import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

export const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export function signToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

// ⚠️  AUTH DISABLED FOR PROTOTYPING - re-enable before going to production
export interface AuthedRequest extends Request {
  user?: { id: string; email: string };
}

export function authMiddleware(req: AuthedRequest, _res: Response, next: NextFunction) {
  req.user = { id: 'dev-user', email: 'dev@local' };
  next();
}
