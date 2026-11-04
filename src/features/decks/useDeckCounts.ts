import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { buildQueue, dayProgress, queueCounts, type QueueCounts } from '../../srs/scheduler';
import { startOfDay } from '../../lib/dates';
import type { Card, ReviewLog } from '../../types';

/** Live New / Learn / Due counts for every deck. */
export function useDeckCounts(now: number): Record<string, QueueCounts> | undefined {
  return useLiveQuery(async () => {
    const [decks, cards, logs] = await Promise.all([
      db.decks.toArray(),
      db.cards.toArray(),
      db.logs.where('reviewedAt').aboveOrEqual(startOfDay(now)).toArray(),
    ]);
    const cardsBy = groupBy(cards, (c) => c.deckId);
    const logsBy = groupBy(logs, (l) => l.deckId);
    const out: Record<string, QueueCounts> = {};
    for (const d of decks) {
      const q = buildQueue(
        cardsBy[d.id] ?? [],
        d.settings,
        dayProgress(logsBy[d.id] ?? [], now),
        now,
      );
      out[d.id] = queueCounts(q);
    }
    return out;
  }, [now]);
}

function groupBy<T extends Card | ReviewLog>(xs: T[], key: (x: T) => string) {
  const out: Record<string, T[]> = {};
  for (const x of xs) (out[key(x)] ??= []).push(x);
  return out;
}
