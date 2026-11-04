import type { CardState, DeckSettings, Rating, SchedulingState } from '../types';
import { DAY, MINUTE, addDays } from '../lib/dates';

export const MIN_EASE = 1.3;
export const MAX_INTERVAL = 36500;
const HARD_FACTOR = 1.2;
const EASY_BONUS = 1.3;
const EASE_STEP_AGAIN = 0.2;
const EASE_STEP_HARD = 0.15;
const EASE_STEP_EASY = 0.15;

export type Rng = () => number;

export function newSchedulingState(settings: DeckSettings, now: number): SchedulingState {
  return {
    state: 'new',
    due: now,
    interval: 0,
    ease: settings.startingEase,
    step: 0,
    reps: 0,
    lapses: 0,
  };
}

/**
 * Apply a rating to a card and return its next scheduling state (Anki-flavoured SM-2).
 * Pure: `now` and `rng` are injected. Pass `rng = null` to disable fuzz (used for previews).
 */
export function schedule(
  card: SchedulingState,
  rating: Rating,
  settings: DeckSettings,
  now: number,
  rng: Rng | null = Math.random,
): SchedulingState {
  const next: SchedulingState = { ...card, reps: card.reps + 1 };
  // Ease is taken from the deck settings at the moment a card is first studied.
  if (card.state === 'new') next.ease = settings.startingEase;

  switch (card.state) {
    case 'new':
    case 'learning':
      return stepCard(next, rating, settings.learningSteps, settings, now, 'learning', rng);
    case 'relearning':
      return stepCard(next, rating, settings.relearningSteps, settings, now, 'relearning', rng);
    case 'review':
      return reviewCard(next, rating, settings, now, rng);
  }
}

function stepCard(
  card: SchedulingState,
  rating: Rating,
  steps: number[],
  settings: DeckSettings,
  now: number,
  phase: Extract<CardState, 'learning' | 'relearning'>,
  rng: Rng | null,
): SchedulingState {
  const isRelearn = phase === 'relearning';
  const graduate = (days: number): SchedulingState => {
    const interval = clampInterval(days, rng);
    return {
      ...card,
      state: 'review',
      step: 0,
      interval,
      due: addDays(now, interval),
    };
  };

  if (steps.length === 0) {
    // No steps configured: go straight to review.
    if (isRelearn) return graduate(Math.max(1, card.interval));
    return graduate(rating === 4 ? settings.easyInterval : settings.graduatingInterval);
  }

  const step = Math.min(card.step, steps.length - 1);

  switch (rating) {
    case 1:
      return { ...card, state: phase, step: 0, due: now + steps[0] * MINUTE };
    case 2: {
      let delay: number;
      if (step === 0 && steps.length > 1) delay = (steps[0] + steps[1]) / 2;
      else if (step === 0) delay = Math.min(steps[0] * 1.5, steps[0] + 24 * 60);
      else delay = steps[step];
      return { ...card, state: phase, step, due: now + delay * MINUTE };
    }
    case 3: {
      const nextStep = step + 1;
      if (nextStep >= steps.length) {
        return graduate(isRelearn ? Math.max(1, card.interval) : settings.graduatingInterval);
      }
      return { ...card, state: phase, step: nextStep, due: now + steps[nextStep] * MINUTE };
    }
    case 4:
      return graduate(isRelearn ? Math.max(1, card.interval) + 1 : settings.easyInterval);
  }
}

function reviewCard(
  card: SchedulingState,
  rating: Rating,
  settings: DeckSettings,
  now: number,
  rng: Rng | null,
): SchedulingState {
  const ivl = Math.max(1, card.interval);
  const ease = card.ease;

  if (rating === 1) {
    const newEase = Math.max(MIN_EASE, ease - EASE_STEP_AGAIN);
    const lapsed: SchedulingState = {
      ...card,
      lapses: card.lapses + 1,
      ease: newEase,
      interval: 1,
      step: 0,
    };
    if (settings.relearningSteps.length === 0) {
      return { ...lapsed, state: 'review', due: addDays(now, 1) };
    }
    return { ...lapsed, state: 'relearning', due: now + settings.relearningSteps[0] * MINUTE };
  }

  const hardIvl = Math.max(ivl + 1, Math.round(ivl * HARD_FACTOR));
  const goodIvl = Math.max(hardIvl + 1, Math.round(ivl * ease));
  const easyIvl = Math.max(goodIvl + 1, Math.round(ivl * ease * EASY_BONUS));

  let interval: number;
  let newEase = ease;
  if (rating === 2) {
    interval = hardIvl;
    newEase = Math.max(MIN_EASE, ease - EASE_STEP_HARD);
  } else if (rating === 3) {
    interval = goodIvl;
  } else {
    interval = easyIvl;
    newEase = ease + EASE_STEP_EASY;
  }

  interval = clampInterval(interval, rng);
  return { ...card, state: 'review', ease: newEase, interval, due: addDays(now, interval) };
}

/** Apply random fuzz (±5%, at least ±1 day for intervals ≥ 3 days) and clamp. */
export function clampInterval(days: number, rng: Rng | null): number {
  let ivl = Math.round(days);
  if (rng && ivl >= 3) {
    const spread = Math.max(1, Math.round(ivl * 0.05));
    ivl += Math.floor(rng() * (2 * spread + 1)) - spread;
  }
  return Math.min(MAX_INTERVAL, Math.max(1, ivl));
}

/** Time until the card would be shown again for each rating (no fuzz), in ms. */
export function previewDelays(
  card: SchedulingState,
  settings: DeckSettings,
  now: number,
): Record<Rating, number> {
  const out = {} as Record<Rating, number>;
  for (const r of [1, 2, 3, 4] as Rating[]) {
    const next = schedule(card, r, settings, now, null);
    out[r] = next.state === 'review' ? next.interval * DAY : Math.max(0, next.due - now);
  }
  return out;
}
