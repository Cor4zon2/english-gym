import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { addCards, createDeck } from './repo';
import { importAnkiNotes } from './ankiImport';
import type { ConvertedNote } from '../lib/anki/convert';

const note = (word: string, ankiDeckId = '2', reviewed = false): ConvertedNote => ({
  ankiDeckId,
  content: { word, translation: 't', examples: [], collocations: [], tags: [] },
  sched: reviewed
    ? { type: 2, queue: 2, due: 1, ivl: 10, factor: 2500, reps: 3, lapses: 0 }
    : { type: 0, queue: 0, due: 0, ivl: 0, factor: 0, reps: 0, lapses: 0 },
});

const col = {
  crt: 1_600_000_000,
  decks: [
    { id: '1', name: 'Default' },
    { id: '2', name: 'English::IELTS' },
    { id: '3', name: 'Phrasal verbs' },
  ],
};

beforeEach(async () => {
  await Promise.all([db.decks.clear(), db.cards.clear(), db.logs.clear()]);
});

describe('importAnkiNotes', () => {
  it('creates one deck per Anki deck and reuses existing ones by name', async () => {
    const existing = await createDeck('Phrasal verbs');
    const res = await importAnkiNotes(col, [note('a'), note('b'), note('give up', '3')], {
      target: { kind: 'anki' },
      keepProgress: false,
      skipDuplicates: true,
    });
    expect(res.added).toBe(3);
    const decks = await db.decks.toArray();
    expect(decks.map((d) => d.name).sort()).toEqual(['English / IELTS', 'Phrasal verbs']);
    expect(await db.cards.where('deckId').equals(existing.id).count()).toBe(1);
  });

  it('skips duplicates in the target deck and within the package', async () => {
    const deck = await createDeck('Mine');
    await addCards(deck.id, [note('Meticulous').content]);
    const res = await importAnkiNotes(col, [note('meticulous'), note('x'), note('X')], {
      target: { kind: 'deck', deckId: deck.id },
      keepProgress: false,
      skipDuplicates: true,
    });
    expect(res).toEqual({ added: 1, duplicates: 2, deckIds: [deck.id] });
  });

  it('keeps Anki progress when asked', async () => {
    await importAnkiNotes(col, [note('a', '2', true)], {
      target: { kind: 'new', name: 'Imported' },
      keepProgress: true,
      skipDuplicates: false,
    });
    const card = (await db.cards.toArray())[0];
    expect(card).toMatchObject({ state: 'review', interval: 10, ease: 2.5, reps: 3 });
  });

  it('imports everything as new without progress', async () => {
    await importAnkiNotes(col, [note('a', '2', true)], {
      target: { kind: 'new', name: 'Imported' },
      keepProgress: false,
      skipDuplicates: false,
    });
    expect((await db.cards.toArray())[0]).toMatchObject({ state: 'new', reps: 0 });
  });
});
