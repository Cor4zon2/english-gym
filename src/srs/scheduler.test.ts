import { describe, expect, it } from 'vitest';
import { DEFAULT_DECK_SETTINGS as S, type Card, type ReviewLog } from '../types';
import { DAY, MINUTE } from '../lib/dates';
import { buildQueue, dayProgress, nextCard, queueCounts } from './scheduler';

const NOW = new Date(2026, 0, 15, 12, 0, 0).getTime();

let n = 0;
function card(p: Partial<Card>): Card {
  n++;
  return {
    id: `c${n}`,
    deckId: 'd',
    word: `w${n}`,
    translation: 't',
    examples: [],
    collocations: [],
    tags: [],
    state: 'new',
    due: NOW,
    interval: 0,
    ease: 2.5,
    step: 0,
    reps: 0,
    lapses: 0,
    createdAt: n,
    updatedAt: n,
    ...p,
  };
}

describe('buildQueue', () => {
  it('splits cards into learning, review and new queues', () => {
    const cards = [
      card({}),
      card({ state: 'learning', due: NOW - MINUTE }),
      card({ state: 'learning', due: NOW + 5 * MINUTE }),
      card({ state: 'learning', due: NOW + 60 * MINUTE }),
      card({ state: 'review', due: NOW - DAY }),
      card({ state: 'review', due: NOW + DAY }),
    ];
    const q = buildQueue(cards, S, { newDone: 0, reviewsDone: 0 }, NOW);
    expect(queueCounts(q)).toEqual({ new: 1, learn: 1, due: 1 });
    expect(q.learningAhead).toHaveLength(1);
  });

  it('respects daily limits minus what was already done today', () => {
    const cards = Array.from({ length: 30 }, () => card({}));
    const q = buildQueue(cards, S, { newDone: 15, reviewsDone: 0 }, NOW);
    expect(q.new).toHaveLength(5);
  });

  it('shows learning cards first and learn-ahead cards last', () => {
    const learn = card({ state: 'learning', due: NOW - MINUTE });
    const ahead = card({ state: 'learning', due: NOW + MINUTE });
    const rev = card({ state: 'review', due: NOW - DAY });
    const q = buildQueue([ahead, rev, learn], S, { newDone: 0, reviewsDone: 0 }, NOW);
    expect(nextCard(q)?.id).toBe(learn.id);
    q.learning = [];
    expect(nextCard(q)?.id).toBe(rev.id);
    q.review = [];
    expect(nextCard(q)?.id).toBe(ahead.id);
    q.learningAhead = [];
    expect(nextCard(q)).toBeNull();
  });
});

describe('dayProgress', () => {
  it('counts only today’s new introductions and reviews', () => {
    const log = (stateBefore: Card['state'], reviewedAt: number): ReviewLog => ({
      id: String(Math.random()),
      cardId: 'c',
      deckId: 'd',
      rating: 3,
      stateBefore,
      intervalBefore: 0,
      intervalAfter: 0,
      easeAfter: 2.5,
      durationMs: 0,
      reviewedAt,
    });
    const p = dayProgress(
      [log('new', NOW), log('learning', NOW), log('review', NOW), log('review', NOW - DAY)],
      NOW,
    );
    expect(p).toEqual({ newDone: 1, reviewsDone: 1 });
  });
});
