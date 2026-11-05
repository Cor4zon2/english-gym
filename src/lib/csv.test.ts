import { describe, expect, it } from 'vitest';
import { cardsToCsv, csvToCards, parseCsv } from './csv';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas and newlines inside fields', () => {
    const rows = parseCsv('a,"b, c","say ""hi""","multi\nline"\r\n1,2,3,4\n');
    expect(rows).toEqual([
      ['a', 'b, c', 'say "hi"', 'multi\nline'],
      ['1', '2', '3', '4'],
    ]);
  });
});

describe('csvToCards', () => {
  it('parses the README example', () => {
    const csv =
      'word,translation,partOfSpeech,transcription,definition,examples,collocations,tags\n' +
      'meticulous,"дотошный, скрупулёзный",adj.,/məˈtɪkjələs/,showing great attention to detail,She kept meticulous records.|He is meticulous about his work.,meticulous attention|meticulous planning,ielts b2\n';
    const { cards, errors } = csvToCards(csv);
    expect(errors).toEqual([]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      word: 'meticulous',
      translation: 'дотошный, скрупулёзный',
      partOfSpeech: 'adj.',
      examples: ['She kept meticulous records.', 'He is meticulous about his work.'],
      collocations: ['meticulous attention', 'meticulous planning'],
      tags: ['ielts', 'b2'],
    });
  });

  it('requires word and translation columns', () => {
    expect(csvToCards('foo,bar\n1,2').errors).toHaveLength(1);
  });

  it('skips rows without required fields', () => {
    const { cards, errors } = csvToCards('word,translation\ncat,кот\ndog,\n');
    expect(cards).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it('round-trips through cardsToCsv', () => {
    const src = [
      {
        word: 'a "quoted", word',
        translation: 'x',
        examples: ['one', 'two'],
        collocations: [],
        tags: ['t1', 't2'],
      },
    ];
    expect(csvToCards(cardsToCsv(src)).cards[0]).toMatchObject(src[0]);
  });
});
