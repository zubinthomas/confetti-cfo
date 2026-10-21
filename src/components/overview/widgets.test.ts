import { describe, expect, it } from 'vitest';
import { OVERVIEW_WIDGETS } from '@/lib/layout/registry';
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
    const group = OVERVIEW_WIDGETS.filter((w) => w.source === 'group').map((w) => w.id);
    expect(area.shown).toEqual(leadership);
    expect(area.order).toEqual(leadership);
    expect(area.hidden).toEqual(group);
  });
});
