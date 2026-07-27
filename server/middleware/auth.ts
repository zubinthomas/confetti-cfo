import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { hasPermission } from '../db/permissions.ts';
import type { Resource, Action } from '../db/permissions.ts';

export const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export function signToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export interface AuthedRequest extends Request {
  user?: { id: number; email: string };
}

interface JwtPayload {
  id: number;
  email: string;
}

/** Verifies the Bearer token and attaches req.user, or 401s. */
export function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ message: 'Missing bearer token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = { id: decoded.id, email: decoded.email };
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/** Requires the authenticated user to have (resource, action), else 403s.
 *  Must run after authMiddleware on the same router. */
export function requirePermission(resource: Resource, action: Action) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (!(await hasPermission(req.user.id, resource, action))) {
      return res.status(403).json({ message: `Forbidden: requires ${resource}:${action}` });
    }
    next();
  };
}

const ENTITY_RESOURCES = new Set<Resource>(['Employee', 'Licence', 'Recruitment', 'LeaveRequest']);

/** Same as requirePermission, but the resource is entities.ts's :entity route
 *  param instead of a fixed value - validated (400) before the permission
 *  check (403) so a typo'd entity name isn't reported as an access problem. */
export function requireEntityPermission(action: Action) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const entity = req.params.entity as Resource;
    if (!ENTITY_RESOURCES.has(entity)) return res.status(400).json({ message: `Unknown entity: ${req.params.entity}` });
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (!(await hasPermission(req.user.id, entity, action))) {
      return res.status(403).json({ message: `Forbidden: requires ${entity}:${action}` });
    }
    next();
  };
}
