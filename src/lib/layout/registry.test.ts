import { describe, expect, it } from 'vitest';
import { GATES, NAV_ITEMS, PAGE_TABS, navTitle } from './registry';
import { PLACEMENTS } from './types';
import { SPOTLIGHT_PAGES } from '@/lib/spotlightConfig';

describe('nav registry', () => {
  it('has unique ids and unique routes', () => {
    const ids = NAV_ITEMS.map((i) => i.id);
    const tos = NAV_ITEMS.map((i) => i.to);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(tos).size).toBe(tos.length);
  });

  it('uses valid placements and absolute routes', () => {
    for (const item of NAV_ITEMS) {
      expect(PLACEMENTS).toContain(item.defaultPlacement);
      expect(item.to.startsWith('/')).toBe(true);
    }
  });

  it('only refers to gates that exist', () => {
    const known = new Set(Object.values(GATES));
    for (const item of NAV_ITEMS) {
      if (item.gate) expect(known.has(item.gate as never)).toBe(true);
    }
  });

  it('gives every gate at least one requirement', () => {
    for (const gate of Object.values(GATES)) expect(gate.requires.length).toBeGreaterThan(0);
  });

  it('keeps the six ops pages and the sidebar sections the shell had', () => {
    const sidebar = NAV_ITEMS.filter((i) => i.defaultPlacement === 'sidebar');
    expect(sidebar).toHaveLength(23);
    expect(sidebar.filter((i) => i.to.startsWith('/ops/'))).toHaveLength(6);
    expect([...new Set(sidebar.map((i) => i.group))]).toEqual([null, 'F&B', 'Retail', 'Non-F&B', 'Finance', 'Operations']);
  });

  it('titles pages by title, then label', () => {
    expect(navTitle('/settings/user')).toBe('User Settings');
    expect(navTitle('/settings')).toBe('General Settings');
    expect(navTitle('/fnb/cafe')).toBe('Cafe');
    expect(navTitle('/nope')).toBeNull();
  });
});

describe('spotlight pages', () => {
  it('cover every searchable nav item and nothing else', () => {
    const searchable = NAV_ITEMS.filter((i) => i.searchable !== false).map((i) => i.to);
    expect(SPOTLIGHT_PAGES.map((p) => p.to)).toEqual(searchable);
  });

  it('carry the same requirements as the nav gates', () => {
    for (const page of SPOTLIGHT_PAGES) {
      const nav = NAV_ITEMS.find((i) => i.to === page.to)!;
      expect(page.requires).toEqual(nav.gate?.requires);
      expect(page.mode).toEqual(nav.gate?.mode);
    }
  });
});

describe('page tabs', () => {
  it('have unique ids within each page and a label', () => {
    for (const [page, tabs] of Object.entries(PAGE_TABS)) {
      const ids = tabs.map((t) => t.id);
      expect(new Set(ids).size, page).toBe(ids.length);
      for (const tab of tabs) expect(tab.label.length, `${page}.${tab.id}`).toBeGreaterThan(0);
    }
  });

  it('keep the HR tabs and the permission each one reads from the API', () => {
    const hr = Object.fromEntries(PAGE_TABS.hr.map((t) => [t.id, t.gate?.requires.map((r) => r.resource)]));
    expect(hr).toEqual({
      headcount: ['Employee'], leave: ['LeaveRequest'], roster: ['Employee'],
      recruitment: ['Recruitment'], documents: ['Employee'],
    });
  });

  it('open the Restaurant module with any of its three permissions and gate each tab', () => {
    expect(GATES.restaurant.mode).toBe('any');
    expect(GATES.restaurant.requires.map((r) => `${r.resource}:${r.action}`)).toEqual([
      'Restaurant:read', 'Reservation:read', 'GuestRegister:read',
    ]);
    const tabs = Object.fromEntries(PAGE_TABS.restaurant.map((t) => [t.id, t.gate?.requires.map((r) => r.resource)]));
    expect(tabs).toEqual({ signin: ['GuestRegister'], day: ['Reservation'], manage: ['Restaurant'] });
  });

  it('keep the users-page tabs in the order the page always used', () => {
    expect(PAGE_TABS.users.map((t) => t.id)).toEqual(['users', 'invites', 'roles', 'layouts']);
  });
});
