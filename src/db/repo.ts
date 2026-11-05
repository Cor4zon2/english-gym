import { db } from './schema';
import {
  DEFAULT_DECK_SETTINGS,
  type Card,
  type CardContent,
  type Deck,
  type DeckSettings,
  type Rating,
  type ReviewLog,
  type SchedulingState,
} from '../types';
import { uid } from '../lib/id';
import { startOfDay } from '../lib/dates';
import { newSchedulingState, schedule } from '../srs/sm2';
import { buildQueue, dayProgress, queueCounts, type QueueCounts } from '../srs/scheduler';

// ---------- decks ----------

export async function createDeck(name: string, description?: string): Promise<Deck> {
  const deck: Deck = {
    id: uid(),
    name: name.trim(),
    description: description?.trim() || undefined,
    settings: { ...DEFAULT_DECK_SETTINGS },
    createdAt: Date.now(),
  };
  await db.decks.add(deck);
  return deck;
}

export async function updateDeck(id: string, patch: Partial<Omit<Deck, 'id'>>) {
  await db.decks.update(id, patch);
}

export async function updateDeckSettings(id: string, settings: DeckSettings) {
  await db.decks.update(id, { settings });
}

export async function deleteDeck(id: string) {
  await db.transaction('rw', db.decks, db.cards, db.logs, async () => {
    await db.cards.where('deckId').equals(id).delete();
    await db.logs.where('deckId').equals(id).delete();
    await db.decks.delete(id);
  });
}

// ---------- cards ----------

export function normalizeContent(c: CardContent): CardContent {
  const list = (xs: string[]) => xs.map((s) => s.trim()).filter(Boolean);
  const opt = (s?: string) => s?.trim() || undefined;
  return {
    word: c.word.trim(),
    translation: c.translation.trim(),
    partOfSpeech: opt(c.partOfSpeech),
    transcription: opt(c.transcription),
    definition: opt(c.definition),
    examples: list(c.examples),
    collocations: list(c.collocations),
    tags: list(c.tags),
    notes: opt(c.notes),
  };
}

export async function addCards(deckId: string, contents: CardContent[]): Promise<number> {
  return addCardsWithState(
    deckId,
    contents.map((content) => ({ content })),
  );
}

export interface NewCard {
  content: CardContent;
  /** Scheduling to start from (e.g. progress imported from Anki). Defaults to a new card. */
  sched?: (settings: DeckSettings, now: number) => SchedulingState;
}

export async function addCardsWithState(deckId: string, items: NewCard[]): Promise<number> {
  const deck = await db.decks.get(deckId);
  if (!deck) throw new Error('Колода не найдена');
  const now = Date.now();
  const cards: Card[] = items.map(({ content, sched }, i) => ({
    id: uid(),
    deckId,
    ...normalizeContent(content),
    ...(sched ? sched(deck.settings, now) : newSchedulingState(deck.settings, now)),
    createdAt: now + i, // keep import order stable
    updatedAt: now,
  }));
  await db.cards.bulkAdd(cards);
  return cards.length;
}

export async function updateCardContent(id: string, content: CardContent) {
  await db.cards.update(id, { ...normalizeContent(content), updatedAt: Date.now() });
}

export async function moveCard(id: string, deckId: string) {
  await db.transaction('rw', db.cards, db.logs, async () => {
    await db.cards.update(id, { deckId, updatedAt: Date.now() });
    await db.logs.where('cardId').equals(id).modify({ deckId });
  });
}

export async function deleteCard(id: string) {
  await db.transaction('rw', db.cards, db.logs, async () => {
    await db.logs.where('cardId').equals(id).delete();
    await db.cards.delete(id);
  });
}

export async function resetCard(id: string) {
  const card = await db.cards.get(id);
  const deck = card && (await db.decks.get(card.deckId));
  if (!card || !deck) return;
  await db.cards.put({ ...card, ...newSchedulingState(deck.settings, Date.now()) });
}

// ---------- reviewing ----------

export interface AnswerResult {
  before: Card;
  after: Card;
  log: ReviewLog;
}

export async function answerCard(
  card: Card,
  rating: Rating,
  settings: DeckSettings,
  durationMs: number,
  now = Date.now(),
): Promise<AnswerResult> {
  const sched = schedule(card, rating, settings, now);
  const after: Card = { ...card, ...sched, updatedAt: now };
  const log: ReviewLog = {
    id: uid(),
    cardId: card.id,
    deckId: card.deckId,
    rating,
    stateBefore: card.state,
    intervalBefore: card.interval,
    intervalAfter: after.interval,
    easeAfter: after.ease,
    durationMs: Math.min(durationMs, 5 * 60_000),
    reviewedAt: now,
  };
  await db.transaction('rw', db.cards, db.logs, async () => {
    await db.cards.put(after);
    await db.logs.add(log);
  });
  return { before: card, after, log };
}

export async function undoAnswer(r: AnswerResult) {
  await db.transaction('rw', db.cards, db.logs, async () => {
    await db.cards.put(r.before);
    await db.logs.delete(r.log.id);
  });
}

export async function todayLogs(deckId?: string, now = Date.now()): Promise<ReviewLog[]> {
  const from = startOfDay(now);
  if (deckId) {
    return db.logs
      .where('[deckId+reviewedAt]')
      .between([deckId, from], [deckId, Infinity])
      .toArray();
  }
  return db.logs.where('reviewedAt').aboveOrEqual(from).toArray();
}

export async function deckCounts(deck: Deck, now = Date.now()): Promise<QueueCounts> {
  const [cards, logs] = await Promise.all([
    db.cards.where('deckId').equals(deck.id).toArray(),
    todayLogs(deck.id, now),
  ]);
  return queueCounts(buildQueue(cards, deck.settings, dayProgress(logs, now), now));
}

// ---------- backup ----------

export interface Backup {
  app: 'english-gym';
  version: 1;
  exportedAt: number;
  decks: Deck[];
  cards: Card[];
  logs: ReviewLog[];
}

export async function exportBackup(): Promise<Backup> {
  const [decks, cards, logs] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    db.logs.toArray(),
  ]);
  return { app: 'english-gym', version: 1, exportedAt: Date.now(), decks, cards, logs };
}

export function isBackup(x: unknown): x is Backup {
  const b = x as Backup;
  return (
    !!b &&
    b.app === 'english-gym' &&
    Array.isArray(b.decks) &&
    Array.isArray(b.cards) &&
    Array.isArray(b.logs)
  );
}

/** Restore a backup. `replace` wipes current data first; otherwise records are merged by id. */
export async function importBackup(b: Backup, replace: boolean) {
  await db.transaction('rw', db.decks, db.cards, db.logs, async () => {
    if (replace) await Promise.all([db.decks.clear(), db.cards.clear(), db.logs.clear()]);
    await db.decks.bulkPut(
      b.decks.map((d) => ({ ...d, settings: { ...DEFAULT_DECK_SETTINGS, ...d.settings } })),
    );
    await db.cards.bulkPut(b.cards);
    await db.logs.bulkPut(b.logs);
  });
}

// ---------- starter deck ----------

export interface StarterDeck {
  name: string;
  description?: string;
  cards: CardContent[];
}

export async function installStarterDeck(url: string): Promise<Deck> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось загрузить колоду (${res.status})`);
  const data = (await res.json()) as StarterDeck;
  const deck = await createDeck(data.name, data.description);
  await addCards(
    deck.id,
    data.cards.map((c) => ({
      ...c,
      examples: c.examples ?? [],
      collocations: c.collocations ?? [],
      tags: c.tags ?? [],
    })),
  );
  return deck;
}
