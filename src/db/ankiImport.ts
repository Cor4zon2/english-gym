import { db } from './schema';
import { addCardsWithState, createDeck, type NewCard } from './repo';
import type { AnkiCollection } from '../lib/anki/apkg';
import { ankiSchedToState, deckDisplayName, type ConvertedNote } from '../lib/anki/convert';

export type AnkiImportTarget =
  | { kind: 'anki' } // one app deck per Anki deck (reused by name if it already exists)
  | { kind: 'deck'; deckId: string }
  | { kind: 'new'; name: string };

export interface AnkiImportOptions {
  target: AnkiImportTarget;
  keepProgress: boolean;
  skipDuplicates: boolean;
}

export interface AnkiImportResult {
  added: number;
  duplicates: number;
  deckIds: string[];
}

const key = (word: string) => word.trim().toLowerCase();

export async function importAnkiNotes(
  col: Pick<AnkiCollection, 'crt' | 'decks'>,
  notes: ConvertedNote[],
  opts: AnkiImportOptions,
): Promise<AnkiImportResult> {
  // Group notes by the app deck they go to.
  const groups = new Map<string, ConvertedNote[]>();
  const push = (deckId: string, n: ConvertedNote) => {
    if (!groups.has(deckId)) groups.set(deckId, []);
    groups.get(deckId)!.push(n);
  };

  if (opts.target.kind === 'anki') {
    const names = new Map(col.decks.map((d) => [d.id, deckDisplayName(d.name)]));
    const existing = new Map(
      (await db.decks.toArray()).map((d) => [d.name.trim().toLowerCase(), d.id]),
    );
    for (const n of notes) {
      const name = names.get(n.ankiDeckId) || 'Anki';
      let deckId = existing.get(name.toLowerCase());
      if (!deckId) {
        deckId = (await createDeck(name)).id;
        existing.set(name.toLowerCase(), deckId);
      }
      push(deckId, n);
    }
  } else {
    const deckId =
      opts.target.kind === 'deck' ? opts.target.deckId : (await createDeck(opts.target.name)).id;
    for (const n of notes) push(deckId, n);
  }

  let added = 0;
  let duplicates = 0;
  for (const [deckId, group] of groups) {
    const seen = new Set<string>();
    if (opts.skipDuplicates) {
      const cards = await db.cards.where('deckId').equals(deckId).toArray();
      for (const c of cards) seen.add(key(c.word));
    }
    const items: NewCard[] = [];
    for (const n of group) {
      if (opts.skipDuplicates) {
        if (seen.has(key(n.content.word))) {
          duplicates++;
          continue;
        }
        seen.add(key(n.content.word));
      }
      items.push({
        content: n.content,
        sched: opts.keepProgress
          ? (settings, now) => ankiSchedToState(n.sched, col.crt, settings, now)
          : undefined,
      });
    }
    if (items.length) added += await addCardsWithState(deckId, items);
  }

  return { added, duplicates, deckIds: [...groups.keys()] };
}
