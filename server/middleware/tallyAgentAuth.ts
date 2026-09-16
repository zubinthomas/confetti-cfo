// Machine auth for the Tally agent - deliberately separate from
// middleware/auth.ts's human JWT login. An agent holds a long-lived API key
// (shown once at creation, see routes/tally.ts) instead of a password, and
// can only reach the agent-facing routes (routes/tallyAgent.ts), never a
// human route.
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { Request, Response, NextFunction } from 'express';
import { db, ready, schema } from '../db/client.ts';

export interface TallyAgentRequest extends Request {
  tallySource?: typeof schema.tallySources.$inferSelect;
}

/** Verifies the Bearer API key by checking it against every tally_sources
 *  row's bcrypt hash - there's no indexed lookup for a hashed credential, but
 *  this table stays small (one row per client install), same "PGlite is
 *  in-process, small app" reasoning as authMiddleware's per-request user
 *  lookup. Attaches the matched source and bumps lastSeenAt, or 401s. */
export async function tallyAgentAuth(req: TallyAgentRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const key = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!key) return res.status(401).json({ message: 'Missing bearer token' });

  await ready();
  const sources = await db.select().from(schema.tallySources);
  let matched: typeof schema.tallySources.$inferSelect | undefined;
  for (const source of sources) {
    if (await bcrypt.compare(key, source.apiKeyHash)) { matched = source; break; }
  }
  if (!matched) return res.status(401).json({ message: 'Invalid API key' });

  await db.update(schema.tallySources)
    .set({ lastSeenAt: new Date().toISOString() })
    .where(eq(schema.tallySources.id, matched.id));
  req.tallySource = matched;
  next();
}
