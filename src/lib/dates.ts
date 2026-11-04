export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Local midnight of the day containing `ts`. */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight `days` days after the day containing `ts` (DST-safe). */
export function addDays(ts: number, days: number): number {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Short human-readable delay, Anki-style: <1м, 10м, 3ч, 4д, 2мес, 1.5г. */
export function formatDelay(ms: number): string {
  if (ms < MINUTE) return '<1м';
  if (ms < HOUR) return `${Math.round(ms / MINUTE)}м`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}ч`;
  const days = ms / DAY;
  if (days < 30) return `${Math.round(days)}д`;
  if (days < 365) return `${trim(days / 30)}мес`;
  return `${trim(days / 365)}г`;
}

function trim(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
