export type CardState = 'new' | 'learning' | 'review' | 'relearning';
export type Rating = 1 | 2 | 3 | 4; // Again / Hard / Good / Easy

export interface DeckSettings {
  newPerDay: number;
  reviewsPerDay: number;
  learningSteps: number[]; // minutes
  relearningSteps: number[]; // minutes
  graduatingInterval: number; // days
  easyInterval: number; // days
  startingEase: number;
}

export interface Deck {
  id: string;
  name: string;
  description?: string;
  settings: DeckSettings;
  createdAt: number;
}

export interface CardContent {
  word: string;
  translation: string;
  partOfSpeech?: string;
  transcription?: string;
  definition?: string;
  examples: string[];
  collocations: string[];
  tags: string[];
  notes?: string;
}

export interface SchedulingState {
  state: CardState;
  due: number;
  interval: number;
  ease: number;
  step: number;
  reps: number;
  lapses: number;
}

export interface Card extends CardContent, SchedulingState {
  id: string;
  deckId: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewLog {
  id: string;
  cardId: string;
  deckId: string;
  rating: Rating;
  stateBefore: CardState;
  intervalBefore: number;
  intervalAfter: number;
  easeAfter: number;
  durationMs: number;
  reviewedAt: number;
}

export const DEFAULT_DECK_SETTINGS: DeckSettings = {
  newPerDay: 20,
  reviewsPerDay: 200,
  learningSteps: [1, 10],
  relearningSteps: [10],
  graduatingInterval: 1,
  easyInterval: 4,
  startingEase: 2.5,
};
