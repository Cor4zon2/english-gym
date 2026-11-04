import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { blankOut } from './cloze';

describe('blankOut', () => {
  it('blanks the word and simple inflections', () => {
    expect(blankOut('She kept meticulous records.', 'meticulous')).toBe('She kept ___ records.');
    expect(blankOut('He was making plans.', 'make')).toBe('He was ___ plans.');
    expect(blankOut('They walked home.', 'walk')).toBe('They ___ home.');
    expect(blankOut('He denied it.', 'deny')).toBe('He ___ it.');
    expect(blankOut('Stop putting it off.', 'put')).toBe('Stop ___ it off.');
  });

  it('handles phrasal verbs and irregular forms', () => {
    expect(blankOut('Please give up smoking.', 'give up')).toBe('Please ___ smoking.');
    expect(blankOut('I gave up last year.', 'give up')).toBe('I ___ last year.');
    expect(blankOut('Stop putting off your homework!', 'put off')).toBe('Stop ___ your homework!');
  });

  it('leaves unrelated words alone', () => {
    expect(blankOut('A catalogue of cats.', 'cat')).toBe('A catalogue of ___.');
  });

  it('blanks the word in every starter-deck example', () => {
    const deck = JSON.parse(readFileSync('public/decks/starter.json', 'utf8')) as {
      cards: { word: string; examples: string[] }[];
    };
    const missed = deck.cards.filter((c) => !blankOut(c.examples[0], c.word).includes('___'));
    expect(missed.map((c) => c.word)).toEqual([]);
  });
});
