// A business unit (venue, outlet or department) the importer has never seen
// is created automatically by merge.ts's resolveUnit. The cost-centre master
// rule is that a new venue name is never given a default group: someone has to
// decide where it belongs. This turns "the plan creates N units" into a
// warning on the batch, so it is visible in the review UI and, because a
// warning is not 'info', blocks a sheet source's auto-commit (see
// canAutoCommit in sheets/sync.ts).
import type { Issue, ParsedWorkbook, RecordChange } from './types.ts';

export function newUnitIssue(details: Record<string, RecordChange[]>): Issue | null {
  const created = (details.businessUnits ?? []).filter((c) => c.action === 'create').map((c) => c.description);
  if (!created.length) return null;
  return {
    level: 'warning',
    sheet: '(workbook)',
    message: `${created.length} new unit${created.length === 1 ? '' : 's'} with no cost centre: ${created.join(', ')}. `
      + 'Decide each one\'s cost centre under Settings > Cost Centres before relying on cost-centre reports.',
  };
}

/** Appends the warning (if any) to the parsed workbook's issues, which is what
 *  gets stored on the batch and checked by canAutoCommit. */
export function addNewUnitWarning(parsed: ParsedWorkbook, plan: { details: Record<string, RecordChange[]> }) {
  const issue = newUnitIssue(plan.details);
  if (issue) parsed.issues.push(issue);
}
