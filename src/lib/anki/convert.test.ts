import { describe, expect, it } from 'vitest';
import { DEFAULT_DECK_SETTINGS } from '../../types';
import { DAY, startOfDay } from '../dates';
import {
  ankiSchedToState,
  convertCollection,
  guessMapping,
  htmlToLines,
  noteToContent,
  parseCloze,
} from './convert';
import type { AnkiCollection, AnkiNoteType } from './apkg';

const basic: AnkiNoteType = { id: '1', name: 'Basic', fields: ['Front', 'Back'], isCloze: false };
const now = Date.UTC(2026, 10, 5, 12);

describe('htmlToLines', () => {
  it('strips tags, media and entities', () => {
    expect(
      htmlToLines(
        '<div>Hello&nbsp;<b>world</b></div><div>a &amp; b<br>c&#39;d [sound:x.mp3]</div><img src="a.png">',
      ),
    ).toEqual(['Hello world', 'a & b', "c'd"]);
  });
});

describe('parseCloze', () => {
  it('extracts answers and hints', () => {
    expect(parseCloze('I {{c1::gave up::сдался}} and {{c2::left}}.')).toEqual({
      answers: ['gave up', 'left'],
      hints: ['сдался'],
      revealed: 'I gave up and left.',
    });
  });
});

describe('guessMapping', () => {
  it('maps Front/Back', () => {
    expect(guessMapping(['Front', 'Back'])).toMatchObject({
      word: 0,
      translation: 1,
      examples: -1,
    });
  });

  it('recognises descriptive field names', () => {
    const m = guessMapping([
      'Word',
      'Word type',
      'IPA',
      'Meaning',
      'Definition',
      'Example sentence',
      'Collocations',
      'Notes',
    ]);
    expect(m).toEqual({
      word: 0,
      partOfSpeech: 1,
      transcription: 2,
      translation: 3,
      definition: 4,
      examples: 5,
      collocations: 6,
      notes: 7,
    });
  });

  it('falls back to the first free fields', () => {
    expect(guessMapping(['Foo', 'Bar', 'Baz'])).toMatchObject({ word: 0, translation: 1 });
    expect(guessMapping(['Перевод', 'Слово'])).toMatchObject({ word: 1, translation: 0 });
  });
});

describe('noteToContent', () => {
  it('converts a basic note', () => {
    const c = noteToContent(
      {
        id: '1',
        noteTypeId: '1',
        fields: ['<b>meticulous</b>', 'дотошный<br>скрупулёзный'],
        tags: ['ielts', 'leech', 'a::b'],
        deckId: '1',
      },
      basic,
      guessMapping(basic.fields),
    );
    expect(c).toEqual({
      word: 'meticulous',
      translation: 'дотошный; скрупулёзный',
      partOfSpeech: undefined,
      transcription: undefined,
      definition: undefined,
      examples: [],
      collocations: [],
      tags: ['ielts', 'a-b'],
      notes: undefined,
    });
  });

  it('turns cloze deletions into word + example', () => {
    const cloze: AnkiNoteType = {
      id: '2',
      name: 'Cloze',
      fields: ['Text', 'Back Extra'],
      isCloze: true,
    };
    const c = noteToContent(
      {
        id: '1',
        noteTypeId: '2',
        fields: ['She {{c1::gave up::сдалась}} smoking.', ''],
        tags: [],
        deckId: '1',
      },
      cloze,
      guessMapping(cloze.fields),
    );
    expect(c).toMatchObject({
      word: 'gave up',
      translation: 'сдалась',
      examples: ['She gave up smoking.'],
    });
  });

  it('returns null when there is no word or translation', () => {
    const n = { id: '1', noteTypeId: '1', fields: ['word', ''], tags: [], deckId: '1' };
    expect(noteToContent(n, basic, guessMapping(basic.fields))).toBeNull();
  });
});

describe('ankiSchedToState', () => {
  const crt = Math.floor(Date.UTC(2026, 0, 1, 4) / 1000);
  const s = DEFAULT_DECK_SETTINGS;

  it('keeps new cards new', () => {
    expect(ankiSchedToState(undefined, crt, s, now).state).toBe('new');
    expect(
      ankiSchedToState(
        { type: 0, queue: 0, due: 5, ivl: 0, factor: 0, reps: 0, lapses: 0 },
        crt,
        s,
        now,
      ),
    ).toMatchObject({ state: 'new', due: now });
  });

  it('converts review cards (due = days since collection creation)', () => {
    const r = ankiSchedToState(
      { type: 2, queue: 2, due: 300, ivl: 21, factor: 2650, reps: 7, lapses: 1 },
      crt,
      s,
      now,
    );
    expect(r).toEqual({
      state: 'review',
      interval: 21,
      ease: 2.65,
      step: 0,
      reps: 7,
      lapses: 1,
      due: startOfDay(crt * 1000 + 300 * DAY),
    });
  });

  it('converts learning cards (due = epoch seconds)', () => {
    const r = ankiSchedToState(
      { type: 1, queue: 1, due: 1_800_000_000, ivl: 0, factor: 0, reps: 1, lapses: 0 },
      crt,
      s,
      now,
    );
    expect(r).toMatchObject({ state: 'learning', due: 1_800_000_000_000, ease: s.startingEase });
  });

  it('keeps suspended relearning cards and clamps ease', () => {
    const r = ankiSchedToState(
      { type: 3, queue: -1, due: 10, ivl: 0, factor: 1000, reps: 9, lapses: 3 },
      crt,
      s,
      now,
    );
    expect(r).toMatchObject({ state: 'relearning', interval: 1, ease: 1.3, lapses: 3 });
  });
});

describe('convertCollection', () => {
  it('orders new cards like Anki and counts skipped notes', () => {
    const col: AnkiCollection = {
      crt: 0,
      noteTypes: [basic],
      decks: [{ id: '1', name: 'Default' }],
      notes: [
        {
          id: 'a',
          noteTypeId: '1',
          fields: ['second', 'x'],
          tags: [],
          deckId: '1',
          sched: { type: 0, queue: 0, due: 2, ivl: 0, factor: 0, reps: 0, lapses: 0 },
        },
        {
          id: 'b',
          noteTypeId: '1',
          fields: ['first', 'x'],
          tags: [],
          deckId: '1',
          sched: { type: 0, queue: 0, due: 1, ivl: 0, factor: 0, reps: 0, lapses: 0 },
        },
        { id: 'c', noteTypeId: '1', fields: ['', 'x'], tags: [], deckId: '1' },
        { id: 'd', noteTypeId: 'missing', fields: ['a', 'b'], tags: [], deckId: '1' },
      ],
    };
    const res = convertCollection(col, {});
    expect(res.notes.map((n) => n.content.word)).toEqual(['first', 'second']);
    expect(res.skipped).toBe(2);
  });
});
