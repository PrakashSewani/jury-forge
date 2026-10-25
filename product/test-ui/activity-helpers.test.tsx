import type { ActivityEntry } from '@jury-forge/shared';
import { describe, expect, it } from 'vitest';
import { actionMeta, groupByDay, matches } from '../src/pages/ActivityPage';

function entry(overrides: Partial<ActivityEntry>): ActivityEntry {
  return {
    id: 1,
    at: 1_700_000_000,
    actor: 'webhook',
    action: 'run.kick',
    target: null,
    detail: null,
    ...overrides,
  };
}

describe('actionMeta', () => {
  it('turns a known action code into its human label and tone', () => {
    expect(actionMeta('repository.enable')).toEqual({ label: 'Enabled repository', tone: 'green' });
  });

  it('falls back to the raw code for an action the page does not know yet', () => {
    expect(actionMeta('future.thing')).toEqual({ label: 'future.thing', tone: 'neutral' });
  });
});

describe('matches', () => {
  it('matches everything for an empty term', () => {
    expect(matches(entry({}), '')).toBe(true);
  });

  it('searches the actor, the code, the human label, the target and the detail', () => {
    const row = entry({
      actor: 'prakashsewani',
      action: 'reviewer.create',
      target: 'Security',
      detail: 'model gpt-5',
    });
    expect(matches(row, 'prakash')).toBe(true);
    expect(matches(row, 'reviewer.create')).toBe(true);
    expect(matches(row, 'created reviewer')).toBe(true);
    expect(matches(row, 'security')).toBe(true);
    expect(matches(row, 'gpt-5')).toBe(true);
    expect(matches(row, 'nothing-here')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matches(entry({ actor: 'Webhook' }), 'WEBHOOK')).toBe(true);
  });
});

describe('groupByDay', () => {
  it('keeps entries from the same calendar day together, newest first', () => {
    const base = new Date(2026, 9, 25, 12).getTime() / 1_000;
    const groups = groupByDay(
      [
        entry({ id: 3, at: base }),
        entry({ id: 2, at: base - 60 }),
        entry({ id: 1, at: base - 86_400 * 2 }),
      ],
      new Date(2026, 9, 25, 15).getTime(),
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].entries.map((row) => row.id)).toEqual([3, 2]);
    expect(groups[0].label).toBe('Today');
    expect(groups[1].entries.map((row) => row.id)).toEqual([1]);
  });

  it('labels the previous calendar day as Yesterday', () => {
    const now = new Date(2026, 9, 25, 9).getTime();
    const yesterday = new Date(2026, 9, 24, 20).getTime() / 1_000;
    const groups = groupByDay([entry({ at: yesterday })], now);
    expect(groups[0].label).toBe('Yesterday');
  });

  it('returns no groups for no entries', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
