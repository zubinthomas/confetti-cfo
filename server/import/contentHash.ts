// Canonicalizes a merge plan's row-level `details` into a stable hash, so two
// batches with the exact same creates/updates (regardless of object key
// order or array order) are recognized as "the same change" - used both to
// group batches in the review UI and to detect no-ops/duplicates-of-rejected
// on arrival (see server/import/batchResolution.ts).
import { createHash } from 'node:crypto';
import type { RecordChange } from './types.ts';

/** Stable hash of a merge plan's details. `stats` is deliberately excluded:
 *  its `unchanged` count can differ between functionally identical pushes
 *  depending on incidental DB state, while `details` is the actual list of
 *  creates/updates - the real content of "what changed". */
export function computeContentHash(details: Record<string, RecordChange[]> | null | undefined): string {
  const tables = Object.keys(details ?? {}).sort();
  const canonical = tables.map((table) => ({
    table,
    changes: [...(details![table] ?? [])]
      .sort((a, b) => a.description.localeCompare(b.description))
      .map((c) => ({
        action: c.action,
        description: c.description,
        fields: (c.fields ?? [])
          .slice()
          .sort((a, b) => a.field.localeCompare(b.field)),
      })),
  }));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
