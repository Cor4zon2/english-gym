import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/schema';
import { answerCard, todayLogs, undoAnswer, type AnswerResult } from '../../db/repo';
import {
  buildQueue,
  dayProgress,
  nextCard,
  queueCounts,
  type QueueCounts,
} from '../../srs/scheduler';
import { previewDelays } from '../../srs/sm2';
import { formatDelay } from '../../lib/dates';
import { speak, speechSupported } from '../../lib/speech';
import { Counts } from '../../components/Counts';
import { NotFound } from '../decks/DeckPage';
import type { Card, Deck, Rating } from '../../types';
import { CardBack, CardFront } from './CardView';
import styles from './Review.module.css';

const RATINGS: { rating: Rating; label: string; cls: string }[] = [
  { rating: 1, label: 'Again', cls: styles.again },
  { rating: 2, label: 'Hard', cls: styles.hard },
  { rating: 3, label: 'Good', cls: styles.good },
  { rating: 4, label: 'Easy', cls: styles.easy },
];

interface Loaded {
  deck: Deck;
  card: Card | null;
  counts: QueueCounts;
  nextLearningAt: number | null;
}

export function ReviewPage() {
  const { deckId = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Loaded | null | undefined>(undefined);
  const [showAnswer, setShowAnswer] = useState(false);
  const [history, setHistory] = useState<AnswerResult[]>([]);
  const [busy, setBusy] = useState(false);
  const shownAt = useRef(Date.now());
  const sessionStart = useRef(Date.now());

  const load = useCallback(
    async (answered: number) => {
      const deck = await db.decks.get(deckId);
      if (!deck) return setData(null);
      const now = Date.now();
      const [cards, logs] = await Promise.all([
        db.cards.where('deckId').equals(deckId).toArray(),
        todayLogs(deckId, now),
      ]);
      const q = buildQueue(cards, deck.settings, dayProgress(logs, now), now);
      const learningLater = cards
        .filter((c) => (c.state === 'learning' || c.state === 'relearning') && c.due > now)
        .map((c) => c.due);
      setData({
        deck,
        card: nextCard(q, answered),
        counts: queueCounts(q),
        nextLearningAt: learningLater.length ? Math.min(...learningLater) : null,
      });
      setShowAnswer(false);
      shownAt.current = Date.now();
    },
    [deckId],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  const card = data?.card ?? null;

  const answer = useCallback(
    async (rating: Rating) => {
      if (!data || !card || busy) return;
      setBusy(true);
      try {
        const res = await answerCard(
          card,
          rating,
          data.deck.settings,
          Date.now() - shownAt.current,
        );
        const h = [...history, res];
        setHistory(h);
        await load(h.length);
      } finally {
        setBusy(false);
      }
    },
    [data, card, busy, history, load],
  );

  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || busy) return;
    setBusy(true);
    try {
      await undoAnswer(last);
      const h = history.slice(0, -1);
      setHistory(h);
      const deck = await db.decks.get(deckId);
      if (deck) {
        setData((d) => (d ? { ...d, card: last.before } : d));
        setShowAnswer(true);
        // refresh counts in the background
        const now = Date.now();
        const [cards, logs] = await Promise.all([
          db.cards.where('deckId').equals(deckId).toArray(),
          todayLogs(deckId, now),
        ]);
        const counts = queueCounts(buildQueue(cards, deck.settings, dayProgress(logs, now), now));
        setData((d) => (d ? { ...d, counts } : d));
      }
    } finally {
      setBusy(false);
    }
  }, [history, busy, deckId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || !card) return;
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        if (showAnswer) answer(3);
        else setShowAnswer(true);
      } else if (showAnswer && ['1', '2', '3', '4'].includes(e.key)) {
        answer(Number(e.key) as Rating);
      } else if (e.code === 'KeyP') {
        speak(card.word);
      } else if (e.code === 'KeyE') {
        navigate(`/card/${card.id}/edit?back=${encodeURIComponent(`/deck/${deckId}/review`)}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, showAnswer, answer, undo, navigate, deckId]);

  if (data === undefined) return null;
  if (data === null) return <NotFound />;

  if (!card) {
    return (
      <Summary
        deck={data.deck}
        history={history}
        startedAt={sessionStart.current}
        nextLearningAt={data.nextLearningAt}
        onUndo={history.length ? undo : undefined}
        onRefresh={() => load(history.length)}
      />
    );
  }

  const delays = previewDelays(card, data.deck.settings, Date.now());

  return (
    <div className={styles.page}>
      <div className="row">
        <Link to={`/deck/${deckId}`} className="small">
          ← {data.deck.name}
        </Link>
        <div className="spacer" />
        <Counts counts={data.counts} />
      </div>

      <div className={`panel ${styles.card}`}>
        <CardFront card={card} showAnswer={showAnswer} />
        {showAnswer && <CardBack card={card} />}
      </div>

      <div className={styles.toolbar}>
        <button
          className="btn ghost small"
          onClick={undo}
          disabled={!history.length || busy}
          title="Ctrl+Z"
        >
          ↶ Отменить
        </button>
        {speechSupported && (
          <button className="btn ghost small" onClick={() => speak(card.word)} title="P">
            🔊 Произнести
          </button>
        )}
        <Link
          className="btn ghost small"
          to={`/card/${card.id}/edit?back=${encodeURIComponent(`/deck/${deckId}/review`)}`}
          title="E"
        >
          ✎ Изменить
        </Link>
      </div>

      <div className={styles.answerBar}>
        {showAnswer ? (
          <div className={styles.ratings}>
            {RATINGS.map(({ rating, label, cls }) => (
              <button
                key={rating}
                className={`btn ${styles.rate} ${cls}`}
                onClick={() => answer(rating)}
                disabled={busy}
              >
                <span className={styles.delay}>{formatDelay(delays[rating])}</span>
                <span>{label}</span>
                <kbd>{rating}</kbd>
              </button>
            ))}
          </div>
        ) : (
          <button className={`btn primary ${styles.show}`} onClick={() => setShowAnswer(true)}>
            Показать ответ <kbd>Space</kbd>
          </button>
        )}
      </div>
    </div>
  );
}

function Summary(props: {
  deck: Deck;
  history: AnswerResult[];
  startedAt: number;
  nextLearningAt: number | null;
  onUndo?: () => void;
  onRefresh: () => void;
}) {
  const { deck, history, startedAt, nextLearningAt } = props;
  const total = history.length;
  const correct = history.filter((h) => h.log.rating > 1).length;
  const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60_000));
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);
  const { onRefresh } = props;
  useEffect(() => {
    if (nextLearningAt && now >= nextLearningAt) onRefresh();
  }, [now, nextLearningAt, onRefresh]);

  return (
    <div className="stack">
      <div className="small">
        <Link to={`/deck/${deck.id}`}>← {deck.name}</Link>
      </div>
      <div className="panel empty stack">
        <div style={{ fontSize: 56 }}>{total ? '🎉' : '✅'}</div>
        <h1>{total ? 'Занятие окончено!' : 'На сегодня всё'}</h1>
        {total > 0 ? (
          <div className={styles.summary}>
            <div>
              <div className={styles.summaryValue}>{total}</div>
              <div className="small muted">карточек</div>
            </div>
            <div>
              <div className={styles.summaryValue}>{Math.round((correct / total) * 100)}%</div>
              <div className="small muted">правильно</div>
            </div>
            <div>
              <div className={styles.summaryValue}>{minutes}</div>
              <div className="small muted">мин</div>
            </div>
          </div>
        ) : (
          <p className="muted">В этой колоде сейчас нет карточек к повторению.</p>
        )}
        {nextLearningAt && (
          <p className="muted small" style={{ margin: 0 }}>
            Изучаемые карточки вернутся через {formatDelay(Math.max(0, nextLearningAt - now))}.
          </p>
        )}
        <div className="row" style={{ justifyContent: 'center' }}>
          {props.onUndo && (
            <button className="btn" onClick={props.onUndo}>
              ↶ Отменить последнюю
            </button>
          )}
          <Link className="btn" to={`/deck/${deck.id}/add`}>
            + Добавить слова
          </Link>
          <Link className="btn primary" to="/">
            К колодам
          </Link>
        </div>
      </div>
    </div>
  );
}
