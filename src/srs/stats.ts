import type { Card, ReviewLog } from '../types';
import { addDays, dayKey, startOfDay } from '../lib/dates';

/** Consecutive days with at least one review, ending today (or yesterday if nothing yet today). */
export function streak(logs: ReviewLog[], now: number): number {
  const days = new Set(logs.map((l) => dayKey(l.reviewedAt)));
  let d = startOfDay(now);
  if (!days.has(dayKey(d))) d = addDays(d, -1);
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** Number of review cards due on each of the next `days` days (overdue counted in today). */
export function forecast(cards: Card[], now: number, days = 7): number[] {
  const out = new Array(days).fill(0);
  const today = startOfDay(now);
  const bounds = Array.from({ length: days }, (_, i) => addDays(today, i + 1));
  for (const c of cards) {
    if (c.state === 'new') continue;
    const i = bounds.findIndex((b) => c.due < b);
    if (i >= 0) out[i]++;
  }
  return out;
}

/** Reviews per day for the last `days` days, oldest first. */
export function history(
  logs: ReviewLog[],
  now: number,
  days = 30,
): { day: number; count: number }[] {
  const counts = new Map<string, number>();
  for (const l of logs) {
    const k = dayKey(l.reviewedAt);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(now, i - days + 1);
    return { day, count: counts.get(dayKey(day)) ?? 0 };
  });
}
