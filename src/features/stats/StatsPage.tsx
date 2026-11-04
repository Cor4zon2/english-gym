import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { forecast, history, streak } from '../../srs/stats';
import { addDays, startOfDay } from '../../lib/dates';
import styles from './Stats.module.css';

const WEEKDAY = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
const DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

export function StatsPage() {
  const decks = useLiveQuery(() => db.decks.orderBy('createdAt').toArray(), []);
  const [deckId, setDeckId] = useState('');
  const data = useLiveQuery(async () => {
    const cards = deckId ? db.cards.where('deckId').equals(deckId).toArray() : db.cards.toArray();
    const logs = deckId ? db.logs.where('deckId').equals(deckId).toArray() : db.logs.toArray();
    return { cards: await cards, logs: await logs };
  }, [deckId]);

  const now = Date.now();
  const s = useMemo(() => {
    if (!data) return null;
    const { cards, logs } = data;
    const today = logs.filter((l) => l.reviewedAt >= startOfDay(now));
    const states = { new: 0, learning: 0, review: 0, relearning: 0 };
    for (const c of cards) states[c.state]++;
    const mature = cards.filter((c) => c.state === 'review' && c.interval >= 21).length;
    const recent = logs.filter((l) => l.reviewedAt >= addDays(now, -30));
    const recentReviews = recent.filter((l) => l.stateBefore === 'review');
    return {
      today: today.length,
      todayCorrect: today.filter((l) => l.rating > 1).length,
      todayMinutes: Math.round(today.reduce((a, l) => a + l.durationMs, 0) / 60_000),
      streak: streak(logs, now),
      forecast: forecast(cards, now, 7),
      history: history(logs, now, 30),
      states,
      mature,
      total: cards.length,
      retention: recentReviews.length
        ? Math.round(
            (recentReviews.filter((l) => l.rating > 1).length / recentReviews.length) * 100,
          )
        : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!decks || !s) return null;

  const maxF = Math.max(1, ...s.forecast);
  const maxH = Math.max(1, ...s.history.map((h) => h.count));

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>Статистика</h1>
        <div className="spacer" />
        <select
          value={deckId}
          onChange={(e) => setDeckId(e.target.value)}
          style={{ width: 'auto' }}
        >
          <option value="">Все колоды</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.tiles}>
        <Tile value={s.today} label="повторено сегодня" />
        <Tile
          value={s.today ? `${Math.round((s.todayCorrect / s.today) * 100)}%` : '—'}
          label="правильно сегодня"
        />
        <Tile value={`${s.streak} 🔥`} label="дней подряд" />
        <Tile value={s.retention === null ? '—' : `${s.retention}%`} label="удержание за 30 дн." />
      </div>

      <div className="panel">
        <h2>Прогноз на неделю</h2>
        <div className={styles.bars} role="img" aria-label="Количество повторений по дням">
          {s.forecast.map((n, i) => {
            const day = addDays(now, i);
            return (
              <div key={i} className={styles.barCol} title={`${DATE.format(day)}: ${n}`}>
                <span className={styles.barValue}>{n}</span>
                <div className={styles.barTrack}>
                  <div className={styles.bar} style={{ height: `${(n / maxF) * 100}%` }} />
                </div>
                <span className="small muted">{i === 0 ? 'сегодня' : WEEKDAY.format(day)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h2>Активность за 30 дней</h2>
        <div className={`${styles.bars} ${styles.dense}`}>
          {s.history.map((h) => (
            <div key={h.day} className={styles.barCol} title={`${DATE.format(h.day)}: ${h.count}`}>
              <div className={styles.barTrack}>
                <div
                  className={`${styles.bar} ${styles.barAlt}`}
                  style={{ height: `${(h.count / maxH) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="row small muted">
          <span>{DATE.format(s.history[0].day)}</span>
          <div className="spacer" />
          <span>сегодня</span>
        </div>
      </div>

      <div className="panel">
        <h2>Карточки</h2>
        {s.total === 0 ? (
          <p className="muted">Карточек пока нет.</p>
        ) : (
          <>
            <div className={styles.stacked}>
              {(
                [
                  ['new', 'var(--new)', 'Новые', s.states.new],
                  ['learn', 'var(--learn)', 'Изучаются', s.states.learning + s.states.relearning],
                  ['young', 'var(--good)', 'Молодые', s.states.review - s.mature],
                  ['mature', 'var(--accent)', 'Зрелые (≥21 д.)', s.mature],
                ] as const
              ).map(([k, color, , n]) =>
                n ? <div key={k} style={{ background: color, flex: n }} /> : null,
              )}
            </div>
            <div className={styles.legend}>
              <Legend color="var(--new)" label="Новые" n={s.states.new} />
              <Legend
                color="var(--learn)"
                label="Изучаются"
                n={s.states.learning + s.states.relearning}
              />
              <Legend color="var(--good)" label="Молодые" n={s.states.review - s.mature} />
              <Legend color="var(--accent)" label="Зрелые (≥21 д.)" n={s.mature} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className={`panel ${styles.tile}`}>
      <div className={styles.tileValue}>{value}</div>
      <div className="small muted">{label}</div>
    </div>
  );
}

function Legend({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <span className="small">
      <span className={styles.dot} style={{ background: color }} /> {label}: <strong>{n}</strong>
    </span>
  );
}
