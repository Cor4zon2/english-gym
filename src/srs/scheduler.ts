import type { Card, DeckSettings, ReviewLog } from '../types';
import { MINUTE, startOfDay } from '../lib/dates';

/** How far ahead learning cards may be shown when nothing else is left (Anki's "learn ahead"). */
export const LEARN_AHEAD_MS = 20 * MINUTE;

export interface DayProgress {
  newDone: number; // new cards introduced today
  reviewsDone: number; // review cards answered today
}

export function dayProgress(logs: ReviewLog[], now: number): DayProgress {
  const from = startOfDay(now);
  let newDone = 0;
  let reviewsDone = 0;
  for (const l of logs) {
    if (l.reviewedAt < from) continue;
    if (l.stateBefore === 'new') newDone++;
    else if (l.stateBefore === 'review') reviewsDone++;
  }
  return { newDone, reviewsDone };
}

export interface Queue {
  learning: Card[]; // learning/relearning cards due now
  learningAhead: Card[]; // learning cards due within LEARN_AHEAD_MS
  review: Card[];
  new: Card[];
}

export interface QueueCounts {
  new: number;
  learn: number;
  due: number;
}

export function buildQueue(
  cards: Card[],
  settings: DeckSettings,
  progress: DayProgress,
  now: number,
): Queue {
  const learning: Card[] = [];
  const learningAhead: Card[] = [];
  const review: Card[] = [];
  const fresh: Card[] = [];

  for (const c of cards) {
    if (c.state === 'learning' || c.state === 'relearning') {
      if (c.due <= now) learning.push(c);
      else if (c.due <= now + LEARN_AHEAD_MS) learningAhead.push(c);
    } else if (c.state === 'review') {
      if (c.due <= now) review.push(c);
    } else {
      fresh.push(c);
    }
  }

  learning.sort((a, b) => a.due - b.due);
  learningAhead.sort((a, b) => a.due - b.due);
  review.sort((a, b) => a.due - b.due || a.id.localeCompare(b.id));
  fresh.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  const reviewLeft = Math.max(0, settings.reviewsPerDay - progress.reviewsDone);
  const newLeft = Math.max(0, settings.newPerDay - progress.newDone);

  return {
    learning,
    learningAhead,
    review: review.slice(0, reviewLeft),
    new: fresh.slice(0, newLeft),
  };
}

export function queueCounts(q: Queue): QueueCounts {
  return { new: q.new.length, learn: q.learning.length, due: q.review.length };
}

/**
 * Pick the next card to show. Order: due learning cards, then reviews and new cards
 * interleaved (one new card after every few reviews), then learning cards due soon.
 * Returns null when the session is finished.
 */
export function nextCard(q: Queue, answeredInSession = 0): Card | null {
  if (q.learning.length) return q.learning[0];
  if (q.review.length && q.new.length) {
    const ratio = Math.max(1, Math.floor(q.review.length / q.new.length));
    return answeredInSession % (ratio + 1) === ratio ? q.new[0] : q.review[0];
  }
  if (q.review.length) return q.review[0];
  if (q.new.length) return q.new[0];
  if (q.learningAhead.length) return q.learningAhead[0];
  return null;
}
