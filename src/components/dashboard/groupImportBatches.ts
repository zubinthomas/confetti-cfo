// Collapses import batches that are the exact same change (same kind,
// source, and content hash) into one group, so the review list shows one
// row per distinct change instead of one row per sync cycle that produced
// it. A batch with no contentHash (pre-dates the column) always becomes its
// own singleton group rather than risk merging unrelated rows.
import type { ImportBatch } from "@/api/importApi";

export interface BatchGroup {
  key: string;
  /** This group's instances, newest first. */
  instances: ImportBatch[];
  /** The instance to show on the collapsed card: the most recent still-pending
   *  preview if one exists, else the most recent instance overall. */
  representative: ImportBatch;
}

function groupKey(b: ImportBatch): string {
  const sourceId = b.sheetSourceId ?? b.tallySourceId ?? "none";
  const hashPart = b.contentHash ?? `id:${b.id}`;
  return `${b.kind}|${b.sourceType}|${sourceId}|${hashPart}`;
}

export function groupBatches(batches: ImportBatch[]): BatchGroup[] {
  const byKey = new Map<string, ImportBatch[]>();
  for (const b of batches) {
    const key = groupKey(b);
    const list = byKey.get(key);
    if (list) list.push(b);
    else byKey.set(key, [b]);
  }

  const groups: BatchGroup[] = [];
  for (const [key, instances] of byKey) {
    const sorted = [...instances].sort((a, b) => b.id - a.id);
    const pendingPreview = sorted.find((b) => b.status === "preview");
    groups.push({ key, instances: sorted, representative: pendingPreview ?? sorted[0] });
  }

  // newest representative first, same ordering feel as the old flat list
  groups.sort((a, b) => b.representative.id - a.representative.id);
  return groups;
}
