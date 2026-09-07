import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import type { Request, Response, NextFunction } from 'express';
import { db, ready, schema } from '../db/client.ts';
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

/** Verifies the Bearer token and attaches req.user, or 401s. Also live-checks
 *  that the user still exists and is active - a deactivated user's existing
 *  token (up to 7 days old, see signToken) is rejected on its very next
 *  request rather than waiting for it to expire. Same generic message as an
 *  invalid signature either way, so a deactivated user's client just looks
 *  logged out, no account-status signal leaked. This adds one uncached DB
 *  round trip per authenticated request; already precedented by
 *  hasPermission doing the same on every permission check - same "PGlite is
 *  in-process, small app" reasoning applies. */
export async function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ message: 'Missing bearer token' });

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  await ready();
  const [user] = await db.select({ active: schema.users.active }).from(schema.users).where(eq(schema.users.id, decoded.id));
  if (!user || !user.active) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  req.user = { id: decoded.id, email: decoded.email };
  next();
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

const ENTITY_RESOURCES = new Set<Resource>(['Employee', 'Licence', 'Recruitment', 'LeaveRequest', 'PayrollRecord', 'EmployeeExit', 'Inventory']);

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
