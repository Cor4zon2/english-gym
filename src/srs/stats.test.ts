import { describe, expect, it } from 'vitest';
import { addDays } from '../lib/dates';
import type { Card, ReviewLog } from '../types';
import { forecast, history, streak } from './stats';

const NOW = new Date(2026, 0, 15, 12).getTime();
const log = (t: number) => ({ reviewedAt: t }) as ReviewLog;

describe('streak', () => {
  it('counts consecutive days ending today', () => {
    expect(
      streak([log(NOW), log(addDays(NOW, -1)), log(addDays(NOW, -2)), log(addDays(NOW, -4))], NOW),
    ).toBe(3);
  });
  it('still counts when today has no reviews yet', () => {
    expect(streak([log(addDays(NOW, -1) + 5000), log(addDays(NOW, -2))], NOW)).toBe(2);
  });
  it('is zero when the chain is broken', () => {
    expect(streak([log(addDays(NOW, -3))], NOW)).toBe(0);
  });
});

describe('forecast', () => {
  it('buckets due cards per day, overdue into today', () => {
    const c = (state: Card['state'], due: number) => ({ state, due }) as Card;
    const f = forecast(
      [
        c('review', addDays(NOW, -3)),
        c('review', addDays(NOW, 0)),
        c('review', addDays(NOW, 2)),
        c('new', NOW),
      ],
      NOW,
      7,
    );
    expect(f).toEqual([2, 0, 1, 0, 0, 0, 0]);
  });
});

describe('history', () => {
  it('returns one bucket per day', () => {
    const h = history([log(NOW), log(NOW)], NOW, 5);
    expect(h).toHaveLength(5);
    expect(h[4].count).toBe(2);
  });
});
