// A business unit, Sienna channel or consignment vendor the importer has never
// seen is created automatically by merge.ts (resolveUnit, resolveNamed,
// resolveVendor). The cost-centre master rule is that a new name is never given
// a default group: someone has to decide where it belongs. This turns "the
// plan creates N of these" into a warning on the batch, so it is visible in
// the review UI and, because a warning is not 'info', blocks a sheet source's
// auto-commit (see canAutoCommit in sheets/sync.ts).
import type { Issue, ParsedWorkbook, RecordChange } from './types.ts';

// plan.details key -> how the message names the kind
const KINDS: [key: string, singular: string, plural: string][] = [
  ['businessUnits', 'unit', 'units'],
  ['channels', 'channel', 'channels'],
  ['vendors', 'vendor', 'vendors'],
];

// Vendor descriptions read "Name (group)"; the group is noise in this message.
const label = (key: string, description: string) => (key === 'vendors' ? description.replace(/\s*\((consignment|other_brands)\)$/, '') : description);

export function newUnitIssue(details: Record<string, RecordChange[]>): Issue | null {
  const parts: string[] = [];
  let total = 0;
  for (const [key, singular, plural] of KINDS) {
    const created = (details[key] ?? []).filter((c) => c.action === 'create').map((c) => label(key, c.description));
    if (!created.length) continue;
    total += created.length;
    parts.push(`${created.length} new ${created.length === 1 ? singular : plural} (${created.join(', ')})`);
  }
  if (!total) return null;
  return {
    level: 'warning',
    sheet: '(workbook)',
    message: `${parts.join(', ')} with no cost centre. `
      + 'Decide each one\'s cost centre under Settings > Cost Centres before relying on cost-centre reports.',
  };
}

/** Appends the warning (if any) to the parsed workbook's issues, which is what
 *  gets stored on the batch and checked by canAutoCommit. */
export function addNewUnitWarning(parsed: ParsedWorkbook, plan: { details: Record<string, RecordChange[]> }) {
  const issue = newUnitIssue(plan.details);
  if (issue) parsed.issues.push(issue);
}
