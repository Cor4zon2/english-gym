import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { formatDelay } from '../../lib/dates';
import { NotFound } from '../decks/DeckPage';
import type { Card } from '../../types';

const STATE_CLASS: Record<Card['state'], string> = {
  new: 'count-new',
  learning: 'count-learn',
  relearning: 'count-learn',
  review: 'count-due',
};

const PAGE = 100;

export function CardsPage() {
  const { deckId = '' } = useParams();
  const deck = useLiveQuery(() => db.decks.get(deckId), [deckId]);
  const cards = useLiveQuery(
    () => db.cards.where('deckId').equals(deckId).sortBy('createdAt'),
    [deckId],
  );
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!cards) return [];
    if (!s) return cards;
    return cards.filter(
      (c) =>
        c.word.toLowerCase().includes(s) ||
        c.translation.toLowerCase().includes(s) ||
        c.tags.some((t) => t.toLowerCase() === s.replace(/^#/, '')),
    );
  }, [cards, q]);

  if (deck === undefined) return null;
  if (!deck) return <NotFound />;
  const now = Date.now();

  return (
    <div className="stack">
      <div className="small">
        <Link to={`/deck/${deckId}`}>← {deck.name}</Link>
      </div>
      <div className="row">
        <h1 style={{ margin: 0 }}>Карточки</h1>
        <div className="spacer" />
        <Link className="btn primary" to={`/deck/${deckId}/add`}>
          + Добавить
        </Link>
      </div>
      <input
        type="search"
        placeholder="Поиск по слову, переводу или тегу…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setLimit(PAGE);
        }}
      />
      {cards && cards.length === 0 ? (
        <div className="panel empty muted">В колоде нет карточек.</div>
      ) : (
        <div className="panel" style={{ padding: '4px 12px', overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Слово</th>
                <th>Перевод</th>
                <th style={{ whiteSpace: 'nowrap' }}>Показ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/card/${c.id}/edit`}>{c.word}</Link>
                    {c.partOfSpeech && <span className="small muted"> {c.partOfSpeech}</span>}
                  </td>
                  <td>{c.translation}</td>
                  <td className={`small ${STATE_CLASS[c.state]}`} style={{ whiteSpace: 'nowrap' }}>
                    {c.state === 'new'
                      ? 'новая'
                      : c.due <= now
                        ? 'сейчас'
                        : formatDelay(c.due - now)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="muted">Ничего не найдено.</p>}
          {filtered.length > limit && (
            <div style={{ textAlign: 'center', padding: 8 }}>
              <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>
                Показать ещё ({filtered.length - limit})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
