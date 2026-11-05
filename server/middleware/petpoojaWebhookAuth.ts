// Machine auth for PetPooja's inbound webhooks (Sales, Menu Push, Order
// Callback, Item Stock On/Off) - separate from middleware/auth.ts's human JWT
// login, same role as tallyAgentAuth.ts. PetPooja's own docs are inconsistent
// about where a shared secret goes per endpoint (header on some, body on
// others), so this checks both rather than picking one. The secret itself is
// one we mint and hand to PetPooja (see routes/petpooja.ts), never one they
// issue us - the opposite direction from appKey/appSecret/accessToken, which
// we send *to* them on outbound calls.
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { Request, Response, NextFunction } from 'express';
import { db, ready, schema } from '../db/client.ts';

export interface PetpoojaWebhookRequest extends Request {
  petpoojaSource?: typeof schema.petpoojaSources.$inferSelect;
}

/** Verifies the shared webhook secret by checking it against every
 *  petpooja_sources row's bcrypt hash - same linear-scan reasoning as
 *  tallyAgentAuth (one row per outlet/environment, table stays small).
 *  Attaches the matched source and bumps lastSeenAt, or 401s. */
export async function petpoojaWebhookAuth(req: PetpoojaWebhookRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const bodyToken = typeof req.body?.token === 'string' ? req.body.token : undefined;
  const key = (header?.startsWith('Bearer ') ? header.slice(7) : undefined) ?? bodyToken;
  if (!key) return res.status(401).json({ message: 'Missing webhook secret' });

  await ready();
  const sources = await db.select().from(schema.petpoojaSources);
  let matched: typeof schema.petpoojaSources.$inferSelect | undefined;
  for (const source of sources) {
    if (await bcrypt.compare(key, source.inboundWebhookSecretHash)) { matched = source; break; }
  }
  if (!matched) return res.status(401).json({ message: 'Invalid webhook secret' });

  await db.update(schema.petpoojaSources)
    .set({ lastSeenAt: new Date().toISOString() })
    .where(eq(schema.petpoojaSources.id, matched.id));
  req.petpoojaSource = matched;
  next();
}
