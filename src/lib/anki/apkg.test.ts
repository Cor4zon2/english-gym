import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { parseApkg } from './apkg';
import { buildSchema11, buildSchema18, zipPackage, zstdRaw, type Fixture } from './testUtils';

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs();
});

const fixture: Fixture = {
  crt: 1_600_000_000,
  noteTypes: [
    { id: 10, name: 'Basic (and reversed card)', fields: ['Front', 'Back'] },
    { id: 20, name: 'Cloze', fields: ['Text', 'Back Extra'], cloze: true },
  ],
  decks: [
    { id: 1, name: 'Default' },
    { id: 2, name: 'English::IELTS' },
  ],
  notes: [
    {
      id: 100,
      mid: 10,
      fields: ['meticulous', 'дотошный'],
      tags: ' ielts b2 ',
      cards: [
        { id: 1001, did: 2, ord: 1, type: 0 },
        { id: 1000, did: 2, ord: 0, type: 2, queue: 2, due: 10, ivl: 5, factor: 2300, reps: 4 },
      ],
    },
    {
      id: 101,
      mid: 20,
      fields: ['She {{c1::gave up}} smoking.', ''],
      cards: [{ id: 1002, did: 2, type: 0, due: 3 }],
    },
  ],
};

function check(col: ReturnType<typeof parseApkg>) {
  expect(col.crt).toBe(1_600_000_000);
  expect(col.decks.find((d) => d.id === '2')?.name).toBe('English::IELTS');
  const basic = col.noteTypes.find((t) => t.id === '10')!;
  expect(basic.fields).toEqual(['Front', 'Back']);
  expect(basic.isCloze).toBe(false);
  expect(col.noteTypes.find((t) => t.id === '20')?.isCloze).toBe(true);

  const [n1, n2] = col.notes;
  expect(n1.fields).toEqual(['meticulous', 'дотошный']);
  expect(n1.tags).toEqual(['ielts', 'b2']);
  expect(n1.deckId).toBe('2');
  // The ord-0 card wins, not the reversed one.
  expect(n1.sched).toMatchObject({ type: 2, due: 10, ivl: 5, factor: 2300, reps: 4 });
  expect(n2.noteTypeId).toBe('20');
}

describe('parseApkg', () => {
  it('reads a legacy collection.anki2 package', () => {
    check(
      parseApkg(SQL, zipPackage({ 'collection.anki2': buildSchema11(SQL, fixture), media: '{}' })),
    );
  });

  it('prefers collection.anki21 over the legacy file', () => {
    const dummy = buildSchema11(SQL, { ...fixture, notes: [] });
    const zip = zipPackage({
      'collection.anki2': dummy,
      'collection.anki21': buildSchema11(SQL, fixture),
    });
    check(parseApkg(SQL, zip));
  });

  it('reads a zstd-compressed schema 18 collection.anki21b', () => {
    const dummy = buildSchema11(SQL, { ...fixture, notes: [] });
    const zip = zipPackage({
      'collection.anki2': dummy,
      'collection.anki21b': zstdRaw(buildSchema18(SQL, fixture)),
    });
    check(parseApkg(SQL, zip));
  });

  it('rejects files that are not Anki packages', () => {
    expect(() => parseApkg(SQL, new Uint8Array([1, 2, 3]))).toThrow(/не колода Anki/);
    expect(() => parseApkg(SQL, zipPackage({ 'readme.txt': 'hi' }))).toThrow(/нет коллекции/);
  });
});
