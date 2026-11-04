import Dexie, { type EntityTable } from 'dexie';
import type { Card, Deck, ReviewLog } from '../types';

export class EnglishGymDB extends Dexie {
  decks!: EntityTable<Deck, 'id'>;
  cards!: EntityTable<Card, 'id'>;
  logs!: EntityTable<ReviewLog, 'id'>;

  constructor(name = 'english-gym') {
    super(name);
    this.version(1).stores({
      decks: 'id, name, createdAt',
      cards: 'id, deckId, [deckId+state], [deckId+due], due, word, createdAt',
      logs: 'id, cardId, deckId, reviewedAt, [deckId+reviewedAt]',
    });
  }
}

export const db = new EnglishGymDB();
