// Agent-facing endpoints: the Rust agent authenticates with its per-install
// API key (tallyAgentAuth, NOT the human JWT auth every other route uses)
// and can only read its own config or push data attributed to its own
// tally_sources row.
import { Router } from 'express';
import { tallyAgentAuth, type TallyAgentRequest } from '../middleware/tallyAgentAuth.ts';
import { ready } from '../db/client.ts';
import { syncTallyPush } from '../tally/sync.ts';
import { loadEffectiveMappings } from '../tally/loadEffectiveMappings.ts';
import type { TallyRecordInput } from '../tally/sync.ts';
import { batchSummary } from './import.ts';

const router = Router();
router.use(tallyAgentAuth);

/** GET /api/tally-agent/config - cadence and which ledgers are in scope
 *  (and, per ledger, whether it wants a point-in-time balance or a
 *  period-aggregated P&L figure), so an admin can retune any of this from
 *  the UI without touching the agent. */
router.get('/config', async (req: TallyAgentRequest, res) => {
  await ready();
  const source = req.tallySource!;
  // Only ledgers that resolve to a business unit and line item: an unmapped
  // ledger has nowhere to land, so the agent doesn't need to send it.
  const effective = await loadEffectiveMappings(source.id);
  res.json({
    syncIntervalMinutes: source.syncIntervalMinutes,
    syncMode: source.syncMode,
    ledgers: [...effective.entries()]
      .filter(([, m]) => m.businessUnitId != null && m.lineItemId != null)
      .map(([name, m]) => ({
        name,
        valueMode: m.valueMode,
        periodGranularity: m.periodGranularity,
      })),
    tallyGatewayUrl: source.tallyGatewayUrl,
    tallyCompanyName: source.tallyCompanyName,
    tallyPeriodReportName: source.tallyPeriodReportName,
  });
});

/** POST /api/tally-agent/sync { records: TallyRecordInput[] } - never 500s
 *  for a data-side problem (unmapped ledgers, validation issues); those come
 *  back as part of the JSON body, same contract as syncTallyPush. */
router.post('/sync', async (req: TallyAgentRequest, res) => {
  const source = req.tallySource!;
  const { records } = req.body as { records?: TallyRecordInput[] };
  if (!Array.isArray(records)) return res.status(400).json({ message: 'records must be an array' });
  const result = await syncTallyPush(source, records);
  res.json({
    status: result.status,
    error: result.error,
    unmappedLedgers: result.unmappedLedgers,
    batches: result.batches.map(batchSummary),
  });
});

export default router;
