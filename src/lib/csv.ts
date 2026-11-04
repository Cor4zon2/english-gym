import type { CardContent } from '../types';

/** RFC 4180-ish CSV parser: handles quotes, escaped quotes, CRLF and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function escape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export const CSV_COLUMNS = [
  'word',
  'translation',
  'partOfSpeech',
  'transcription',
  'definition',
  'examples',
  'collocations',
  'tags',
  'notes',
] as const;

const splitList = (v: string | undefined, sep: RegExp) =>
  (v ?? '')
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);

export interface CsvParseResult {
  cards: CardContent[];
  errors: string[];
}

export function csvToCards(text: string): CsvParseResult {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (rows.length === 0) return { cards: [], errors: ['Файл пуст'] };

  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  if (idx('word') < 0 || idx('translation') < 0) {
    return { cards: [], errors: ['В первой строке должны быть колонки word и translation'] };
  }

  const cards: CardContent[] = [];
  rows.slice(1).forEach((r, i) => {
    const get = (name: string) => {
      const j = idx(name);
      return j >= 0 ? (r[j] ?? '').trim() : '';
    };
    const word = get('word');
    const translation = get('translation');
    if (!word || !translation) {
      errors.push(`Строка ${i + 2}: нет word или translation — пропущена`);
      return;
    }
    cards.push({
      word,
      translation,
      partOfSpeech: get('partOfSpeech') || undefined,
      transcription: get('transcription') || undefined,
      definition: get('definition') || undefined,
      examples: splitList(get('examples'), /\|/),
      collocations: splitList(get('collocations'), /\|/),
      tags: splitList(get('tags'), /[\s,]+/),
      notes: get('notes') || undefined,
    });
  });
  return { cards, errors };
}

export function cardsToCsv(cards: CardContent[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const c of cards) {
    lines.push(
      [
        c.word,
        c.translation,
        c.partOfSpeech ?? '',
        c.transcription ?? '',
        c.definition ?? '',
        c.examples.join('|'),
        c.collocations.join('|'),
        c.tags.join(' '),
        c.notes ?? '',
      ]
        .map(escape)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}
