import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import {
  addCards,
  answerCard,
  createDeck,
  deckCounts,
  deleteDeck,
  exportBackup,
  importBackup,
  undoAnswer,
} from './repo';

const content = (word: string) => ({
  word,
  translation: 'x',
  examples: [],
  collocations: [],
  tags: [],
});

beforeEach(async () => {
  await Promise.all([db.decks.clear(), db.cards.clear(), db.logs.clear()]);
});

describe('repo', () => {
  it('creates a deck with cards and counts them as new', async () => {
    const deck = await createDeck('IELTS');
    await addCards(deck.id, [content('a'), content('b')]);
    expect(await deckCounts(deck)).toEqual({ new: 2, learn: 0, due: 0 });
  });

  it('answers a card, logs it and can undo', async () => {
    const deck = await createDeck('D');
    await addCards(deck.id, [content('a')]);
    const card = (await db.cards.toArray())[0];
    const res = await answerCard(card, 3, deck.settings, 1000);
    expect((await db.cards.get(card.id))?.state).toBe('learning');
    expect(await db.logs.count()).toBe(1);
    expect(await deckCounts(deck, Date.now())).toEqual({ new: 0, learn: 0, due: 0 });

    await undoAnswer(res);
    expect((await db.cards.get(card.id))?.state).toBe('new');
    expect(await db.logs.count()).toBe(0);
  });

  it('deletes a deck together with its cards and logs', async () => {
    const deck = await createDeck('D');
    await addCards(deck.id, [content('a')]);
    const card = (await db.cards.toArray())[0];
    await answerCard(card, 1, deck.settings, 0);
    await deleteDeck(deck.id);
    expect(await db.cards.count()).toBe(0);
    expect(await db.logs.count()).toBe(0);
  });

  it('round-trips a JSON backup', async () => {
    const deck = await createDeck('D');
    await addCards(deck.id, [content('a'), content('b')]);
    const backup = JSON.parse(JSON.stringify(await exportBackup()));
    await deleteDeck(deck.id);
    await importBackup(backup, true);
    expect(await db.decks.count()).toBe(1);
    expect(await db.cards.count()).toBe(2);
  });
});
