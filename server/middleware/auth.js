import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

// ⚠️  AUTH DISABLED FOR PROTOTYPING — re-enable before going to production
export function authMiddleware(req, _res, next) {
  req.user = { id: 'dev-user', email: 'dev@local' };
  next();
}
