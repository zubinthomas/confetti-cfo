import { describe, expect, it } from 'vitest';
import { GATES, OVERVIEW_WIDGETS } from '@/lib/layout/registry';
import { resolveWidgets } from '@/lib/layout/resolve';
import type { CanFn } from '@/lib/layout/types';
import { readFileSync } from 'node:fs';
import leadershipPreset from '@/lib/layout/presets/leadership.json';

// widgets.ts imports React components that need a DOM, which the node test
// environment doesn't have, so the component map is checked from its source.
const mapped = [...readFileSync(new URL('./widgets.ts', import.meta.url), 'utf8').matchAll(/^\s+"([a-z]+\.[A-Za-z.]+)":/gm)]
  .map((m) => m[1]);

describe('overview widgets', () => {
  it('has unique ids and one component for each', () => {
    const ids = OVERVIEW_WIDGETS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...mapped].sort()).toEqual([...ids].sort());
  });

  it('starts with the Group widgets shown and the Leadership ones hidden', () => {
    for (const w of OVERVIEW_WIDGETS) {
      expect(Boolean(w.defaultHidden), w.id).toBe(w.source === 'leadership');
      expect(w.id.startsWith(`${w.source}.`), w.id).toBe(true);
    }
  });

  it('keeps the Leadership preset in step with the registry', () => {
    const area = leadershipPreset.widgets.overview;
    const leadership = OVERVIEW_WIDGETS.filter((w) => w.source === 'leadership').map((w) => w.id);
    // The group header follows its section, so a preset never needs to list it.
    const group = OVERVIEW_WIDGETS.filter((w) => w.source === 'group' && !w.sectionHeader).map((w) => w.id);
    expect(area.shown).toEqual(leadership);
    expect(area.order).toEqual(leadership);
    expect(area.hidden).toEqual(group);
  });

  const visibleFor = (...keys: string[]) => {
    const can: CanFn = (resource, action) => keys.includes(`${resource}:${action}`);
    // Every widget shown, so only the gate decides.
    const layer = { v: 1 as const, widgets: { overview: { shown: OVERVIEW_WIDGETS.map((w) => w.id) } } };
    return resolveWidgets({ areaId: 'overview', widgets: OVERVIEW_WIDGETS, can, layers: [layer] }).map((r) => r.widget.id);
  };

  it('gates every widget on financial records, and the targets card on the store gate too', () => {
    for (const w of OVERVIEW_WIDGETS) {
      expect(w.gate, w.id).toBe(w.id === 'group.targets' ? GATES.store : GATES.financial);
    }
  });

  it('shows nothing without FinancialRecord:read and no targets card without SalesRecord:read', () => {
    expect(visibleFor()).toEqual([]);
    expect(visibleFor('SalesRecord:read')).toEqual([]);
    const financialOnly = visibleFor('FinancialRecord:read');
    expect(financialOnly).toHaveLength(OVERVIEW_WIDGETS.length - 1);
    expect(financialOnly).toContain('group.header');
    expect(financialOnly).not.toContain('group.targets');
    expect(visibleFor('FinancialRecord:read', 'SalesRecord:read')).toContain('group.targets');
  });
});
