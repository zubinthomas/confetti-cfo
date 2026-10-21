import { describe, expect, it } from 'vitest';
import { hrSubtitle, summariseEmployees } from './hrSummary';

describe('summariseEmployees', () => {
  it('counts current staff and their distinct divisions', () => {
    const summary = summariseEmployees([
      { status: 'Active', division: 'Pottery' },
      { status: 'On Leave', division: 'Pottery' },
      { status: 'Probation', division: 'Retail' },
      { status: 'Notice Period', division: 'Culinary' },
    ]);
    expect(summary).toEqual({ employees: 4, divisions: 3 });
  });

  it('leaves out people who have left, and divisions only they were in', () => {
    const summary = summariseEmployees([
      { status: 'Active', division: 'Pottery' },
      { status: 'Terminated', division: 'Legal' },
      { status: 'Resigned', division: 'Legal' },
    ]);
    expect(summary).toEqual({ employees: 1, divisions: 1 });
  });

  it('ignores blank divisions and handles an empty list', () => {
    expect(summariseEmployees([{ status: 'Active', division: '' }, { status: 'Active', division: null }]))
      .toEqual({ employees: 2, divisions: 0 });
    expect(summariseEmployees([])).toEqual({ employees: 0, divisions: 0 });
  });
});

describe('hrSubtitle', () => {
  it('shows only the company until the counts are known', () => {
    expect(hrSubtitle(undefined)).toBe('Confetti Exports');
  });

  it('formats the counts', () => {
    expect(hrSubtitle({ employees: 119, divisions: 15 })).toBe('Confetti Exports · 15 divisions · 119 employees');
  });

  it('uses singular forms for one', () => {
    expect(hrSubtitle({ employees: 1, divisions: 1 })).toBe('Confetti Exports · 1 division · 1 employee');
  });
});
