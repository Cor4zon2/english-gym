import { describe, expect, it } from 'vitest';
import { DEFAULT_DECK_SETTINGS as S, type SchedulingState } from '../types';
import { DAY, MINUTE, addDays } from '../lib/dates';
import { MIN_EASE, clampInterval, newSchedulingState, previewDelays, schedule } from './sm2';

const NOW = new Date(2026, 0, 15, 12, 0, 0).getTime();
const noFuzz = null;

function review(interval: number, ease = 2.5): SchedulingState {
  return { state: 'review', due: NOW, interval, ease, step: 0, reps: 5, lapses: 0 };
}

describe('new / learning cards', () => {
  const fresh = newSchedulingState(S, NOW);

  it('Again goes to the first learning step', () => {
    const n = schedule(fresh, 1, S, NOW, noFuzz);
    expect(n.state).toBe('learning');
    expect(n.step).toBe(0);
    expect(n.due).toBe(NOW + 1 * MINUTE);
    expect(n.reps).toBe(1);
  });

  it('Hard on the first step uses the average of the first two steps', () => {
    const n = schedule(fresh, 2, S, NOW, noFuzz);
    expect(n.state).toBe('learning');
    expect(n.due).toBe(NOW + 5.5 * MINUTE);
  });

  it('Good advances through steps and then graduates', () => {
    const a = schedule(fresh, 3, S, NOW, noFuzz);
    expect(a.state).toBe('learning');
    expect(a.step).toBe(1);
    expect(a.due).toBe(NOW + 10 * MINUTE);

    const b = schedule(a, 3, S, NOW, noFuzz);
    expect(b.state).toBe('review');
    expect(b.interval).toBe(S.graduatingInterval);
    expect(b.due).toBe(addDays(NOW, 1));
    expect(b.ease).toBe(2.5);
  });

  it('Easy graduates immediately with the easy interval', () => {
    const n = schedule(fresh, 4, S, NOW, noFuzz);
    expect(n.state).toBe('review');
    expect(n.interval).toBe(4);
    expect(n.due).toBe(addDays(NOW, 4));
  });

  it('graduates straight away when there are no learning steps', () => {
    const n = schedule(fresh, 3, { ...S, learningSteps: [] }, NOW, noFuzz);
    expect(n.state).toBe('review');
    expect(n.interval).toBe(1);
  });
});

describe('review cards', () => {
  it('Again lapses into relearning and lowers ease by 20%', () => {
    const n = schedule(review(10), 1, S, NOW, noFuzz);
    expect(n.state).toBe('relearning');
    expect(n.lapses).toBe(1);
    expect(n.ease).toBeCloseTo(2.3);
    expect(n.interval).toBe(1);
    expect(n.due).toBe(NOW + 10 * MINUTE);
  });

  it('Hard multiplies the interval by 1.2 and lowers ease by 15%', () => {
    const n = schedule(review(10), 2, S, NOW, noFuzz);
    expect(n.interval).toBe(12);
    expect(n.ease).toBeCloseTo(2.35);
  });

  it('Good multiplies the interval by ease', () => {
    const n = schedule(review(10), 3, S, NOW, noFuzz);
    expect(n.interval).toBe(25);
    expect(n.ease).toBe(2.5);
    expect(n.due).toBe(addDays(NOW, 25));
  });

  it('Easy multiplies by ease × 1.3 and raises ease by 15%', () => {
    const n = schedule(review(10), 4, S, NOW, noFuzz);
    expect(n.interval).toBe(33);
    expect(n.ease).toBeCloseTo(2.65);
  });

  it('keeps Hard < Good < Easy even for tiny intervals', () => {
    const p = previewDelays(review(1, MIN_EASE), S, NOW);
    expect(p[2]).toBeLessThan(p[3]);
    expect(p[3]).toBeLessThan(p[4]);
  });

  it('never drops ease below the minimum', () => {
    let c = review(10, MIN_EASE);
    c = schedule(c, 1, S, NOW, noFuzz);
    expect(c.ease).toBe(MIN_EASE);
    c = schedule({ ...c, state: 'review' }, 2, S, NOW, noFuzz);
    expect(c.ease).toBe(MIN_EASE);
  });

  it('relearning Good returns the card to review', () => {
    const lapsed = schedule(review(10), 1, S, NOW, noFuzz);
    const back = schedule(lapsed, 3, S, NOW, noFuzz);
    expect(back.state).toBe('review');
    expect(back.interval).toBe(1);
  });
});

describe('fuzz', () => {
  it('does not fuzz short intervals', () => {
    expect(clampInterval(2, () => 0.99)).toBe(2);
  });

  it('keeps fuzz within ±5% (at least ±1 day)', () => {
    expect(clampInterval(10, () => 0)).toBe(9);
    expect(clampInterval(10, () => 0.999)).toBe(11);
    expect(clampInterval(100, () => 0)).toBe(95);
    expect(clampInterval(100, () => 0.999)).toBe(105);
  });
});

describe('previewDelays', () => {
  it('reports minutes for learning and days for review', () => {
    const p = previewDelays(newSchedulingState(S, NOW), S, NOW);
    expect(p[1]).toBe(1 * MINUTE);
    expect(p[3]).toBe(10 * MINUTE);
    expect(p[4]).toBe(4 * DAY);
  });
});
