import type { CardContent, DeckSettings, SchedulingState } from '../../types';
import { DAY, startOfDay } from '../dates';
import { MIN_EASE, newSchedulingState } from '../../srs/sm2';
import type { AnkiCollection, AnkiNote, AnkiNoteType, AnkiSched } from './apkg';

// ---------- HTML → text ----------

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  mdash: '—',
  ndash: '–',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  bull: '•',
  shy: '',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Convert an Anki field (HTML) to plain text lines. Media references are dropped. */
export function htmlToLines(html: string): string[] {
  const text = decodeEntities(
    html
      .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/\[sound:[^\]]*\]/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(div|p|li|ul|ol|tr|h[1-6]|blockquote)\b[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  );
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export const htmlToText = (html: string, sep = ' ') => htmlToLines(html).join(sep);

// ---------- cloze ----------

const CLOZE_RE = /\{\{c\d+::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

export const hasCloze = (s: string) => /\{\{c\d+::/.test(s);

/** Answers and hints of `{{c1::answer::hint}}` deletions, plus the text with clozes revealed. */
export function parseCloze(text: string): { answers: string[]; hints: string[]; revealed: string } {
  const answers: string[] = [];
  const hints: string[] = [];
  const revealed = text.replace(CLOZE_RE, (_, a: string, h?: string) => {
    answers.push(a);
    if (h) hints.push(h);
    return a;
  });
  return { answers, hints, revealed };
}

// ---------- field mapping ----------

export const TARGET_FIELDS = [
  'word',
  'translation',
  'partOfSpeech',
  'transcription',
  'definition',
  'examples',
  'collocations',
  'notes',
] as const;
export type TargetField = (typeof TARGET_FIELDS)[number];

export const TARGET_LABELS: Record<TargetField, string> = {
  word: 'Слово',
  translation: 'Перевод',
  partOfSpeech: 'Часть речи',
  transcription: 'Транскрипция',
  definition: 'Определение',
  examples: 'Примеры',
  collocations: 'Коллокации',
  notes: 'Заметки',
};

/** For each app field, the index of the Anki field it is filled from (-1 = none). */
export type FieldMapping = Record<TargetField, number>;

// Order matters: specific fields are matched first so that e.g. "Word type" becomes part of speech.
const PATTERNS: [TargetField, RegExp][] = [
  ['transcription', /ipa|transcri|pronunc|phonetic|транскрип|произнош/],
  ['partOfSpeech', /part ?of ?speech|^pos$|word ?type|word ?class|часть ?речи/],
  ['collocations', /collocation|коллокац|сочетани|phrases?$/],
  ['examples', /example|sentence|context|usage|пример|предложени/],
  ['definition', /defin|explanation|определени|толковани/],
  ['notes', /note|comment|extra|hint|замет|коммент|подсказ/],
  [
    'word',
    /^(word|front|term|expression|vocab|vocabulary|english|en|eng|headword|lemma|text|question|слово|лицевая|термин|вопрос)$/,
  ],
  ['translation', /translat|meaning|russian|^ru$|^rus$|^back$|answer|перевод|значени|ответ|оборот/],
];

export function guessMapping(fieldNames: string[]): FieldMapping {
  const mapping = Object.fromEntries(TARGET_FIELDS.map((f) => [f, -1])) as FieldMapping;
  const used = new Set<number>();
  const norm = fieldNames.map((n) =>
    n
      .toLowerCase()
      .replace(/[_\-.]+/g, ' ')
      .trim(),
  );

  for (const [target, re] of PATTERNS) {
    const i = norm.findIndex((n, j) => !used.has(j) && re.test(n));
    if (i >= 0) {
      mapping[target] = i;
      used.add(i);
    }
  }
  // Fallbacks: the first free fields are the word and its translation (Front/Back convention).
  for (const target of ['word', 'translation'] as const) {
    if (mapping[target] >= 0) continue;
    const i = fieldNames.findIndex((_, j) => !used.has(j));
    if (i >= 0) {
      mapping[target] = i;
      used.add(i);
    }
  }
  return mapping;
}

// ---------- note → card content ----------

const splitTags = (tags: string[]) =>
  tags.map((t) => t.replace(/::/g, '-')).filter((t) => t.toLowerCase() !== 'leech');

export function noteToContent(
  note: AnkiNote,
  noteType: AnkiNoteType,
  mapping: FieldMapping,
): CardContent | null {
  const raw = (t: TargetField) => (mapping[t] >= 0 ? (note.fields[mapping[t]] ?? '') : '');
  const lines = (t: TargetField) => htmlToLines(raw(t)).map((l) => parseCloze(l).revealed);
  const text = (t: TargetField, sep = ' ') => lines(t).join(sep);

  let word = text('word');
  let translation = text('translation', '; ');
  let examples = lines('examples');

  const wordRaw = htmlToText(raw('word'));
  if (noteType.isCloze || hasCloze(wordRaw)) {
    // Cloze note: the deleted part becomes the word, the sentence becomes an example.
    const { answers, hints, revealed } = parseCloze(wordRaw);
    if (answers.length) {
      word = [...new Set(answers.map((a) => a.trim()))].join(', ');
      examples = [revealed, ...examples];
      if (!translation) translation = hints.join('; ');
      if (!translation) translation = revealed;
    }
  }

  const definition = text('definition') || undefined;
  if (!translation && definition) translation = definition;
  if (!word || !translation) return null;

  const collocations = lines('collocations')
    .flatMap((l) => l.split(/[;|,]/))
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    word,
    translation,
    partOfSpeech: text('partOfSpeech') || undefined,
    transcription: text('transcription') || undefined,
    definition: definition === translation ? undefined : definition,
    examples,
    collocations,
    tags: splitTags(note.tags),
    notes: text('notes', '\n') || undefined,
  };
}

// ---------- scheduling ----------

/** Convert an Anki card's scheduling to ours. `crt` is the collection creation time in seconds. */
export function ankiSchedToState(
  s: AnkiSched | undefined,
  crt: number,
  settings: DeckSettings,
  now: number,
): SchedulingState {
  const base = newSchedulingState(settings, now);
  if (!s || s.type === 0 || s.type > 3) return base;

  const dayDue = (d: number) => startOfDay(crt * 1000 + d * DAY);
  // Learning queue (1) stores an epoch timestamp in seconds; day-learn (3) and review store days.
  const due = s.queue === 1 || s.queue === 4 ? s.due * 1000 : dayDue(s.due);
  const ease = s.factor > 0 ? Math.max(MIN_EASE, s.factor / 1000) : settings.startingEase;
  const common = {
    ease,
    step: 0,
    reps: s.reps,
    lapses: s.lapses,
    due: Number.isFinite(due) && due > 0 ? due : now,
  };

  switch (s.type) {
    case 1:
      return { ...common, state: 'learning', interval: 0 };
    case 2:
      return { ...common, state: 'review', interval: Math.max(1, s.ivl) };
    default:
      return { ...common, state: 'relearning', interval: Math.max(1, s.ivl) };
  }
}

// ---------- whole package ----------

export interface NoteTypeSummary extends AnkiNoteType {
  noteCount: number;
}

/** Note types that actually have notes, most used first. */
export function usedNoteTypes(col: AnkiCollection): NoteTypeSummary[] {
  const counts = new Map<string, number>();
  for (const n of col.notes) counts.set(n.noteTypeId, (counts.get(n.noteTypeId) ?? 0) + 1);
  return col.noteTypes
    .filter((t) => counts.has(t.id))
    .map((t) => ({ ...t, noteCount: counts.get(t.id)! }))
    .sort((a, b) => b.noteCount - a.noteCount);
}

export interface ConvertedNote {
  ankiDeckId: string;
  content: CardContent;
  sched?: AnkiSched;
}

export interface ConvertResult {
  notes: ConvertedNote[];
  skipped: number; // notes without a word or translation after conversion
}

export function convertCollection(
  col: AnkiCollection,
  mappings: Record<string, FieldMapping>,
): ConvertResult {
  const types = new Map(col.noteTypes.map((t) => [t.id, t]));
  const notes: ConvertedNote[] = [];
  let skipped = 0;
  // Keep Anki's order of new cards (their `due` is the position in the new queue).
  const order = (n: AnkiNote) => (n.sched && n.sched.type === 0 ? n.sched.due : Infinity);
  const sorted = [...col.notes].sort((a, b) => order(a) - order(b));
  for (const n of sorted) {
    const type = types.get(n.noteTypeId);
    const mapping = type && (mappings[type.id] ?? guessMapping(type.fields));
    const content = type && mapping ? noteToContent(n, type, mapping) : null;
    if (content) notes.push({ ankiDeckId: n.deckId, content, sched: n.sched });
    else skipped++;
  }
  return { notes, skipped };
}

/** Anki deck path → deck name in the app ("Parent::Child" → "Parent / Child"). */
export const deckDisplayName = (name: string) => name.split('::').join(' / ');
