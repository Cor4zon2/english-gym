import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { createDeck, installStarterDeck } from '../../db/repo';
import { Counts } from '../../components/Counts';
import { Modal } from '../../components/Modal';
import { useNow } from '../../lib/useNow';
import { useDeckCounts } from './useDeckCounts';
import styles from './Decks.module.css';

export function DeckListPage() {
  const now = useNow();
  const decks = useLiveQuery(() => db.decks.orderBy('createdAt').toArray(), []);
  const cardTotals = useLiveQuery(async () => {
    const out: Record<string, number> = {};
    await db.cards.each((c) => (out[c.deckId] = (out[c.deckId] ?? 0) + 1));
    return out;
  }, []);
  const counts = useDeckCounts(now);
  const [creating, setCreating] = useState(false);
  const [loadingStarter, setLoadingStarter] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const addStarter = async () => {
    setLoadingStarter(true);
    setError('');
    try {
      const deck = await installStarterDeck(`${import.meta.env.BASE_URL}decks/starter.json`);
      navigate(`/deck/${deck.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingStarter(false);
    }
  };

  if (!decks) return null;

  const totalDue = Object.values(counts ?? {}).reduce((s, c) => s + c.new + c.learn + c.due, 0);

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>Колоды</h1>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setCreating(true)}>
          + Новая колода
        </button>
      </div>

      {decks.length === 0 ? (
        <div className="panel empty stack">
          <div style={{ fontSize: 48 }}>📚</div>
          <h2>Пока нет ни одной колоды</h2>
          <p className="muted">
            Создайте свою колоду или начните со стартовой — около 60 полезных слов уровня B1–B2.
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={addStarter} disabled={loadingStarter}>
              {loadingStarter ? 'Загрузка…' : 'Добавить стартовую колоду'}
            </button>
            <button className="btn" onClick={() => setCreating(true)}>
              Создать пустую
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {totalDue > 0 ? `На сегодня карточек: ${totalDue}` : 'На сегодня всё повторено 🎉'}
          </p>
          <div className={`panel ${styles.list}`}>
            <div className={`${styles.item} ${styles.head} small muted`}>
              <span>Колода</span>
              <span className="counts">
                <span className="count-new">New</span>
                <span className="count-learn">Learn</span>
                <span className="count-due">Due</span>
              </span>
              <span
                className="btn primary"
                aria-hidden
                style={{ visibility: 'hidden', minHeight: 0 }}
              >
                Учить
              </span>
            </div>
            {decks.map((d) => {
              const c = counts?.[d.id];
              const has = c && c.new + c.learn + c.due > 0;
              return (
                <div key={d.id} className={styles.item}>
                  <Link to={`/deck/${d.id}`} className={styles.name}>
                    <strong>{d.name}</strong>
                    <span className="small muted">{cardTotals?.[d.id] ?? 0} карт.</span>
                  </Link>
                  <Counts counts={c} />
                  <button
                    className="btn primary"
                    disabled={!has}
                    onClick={() => navigate(`/deck/${d.id}/review`)}
                  >
                    Учить
                  </button>
                </div>
              );
            })}
          </div>
          <div className="row">
            <button className="btn ghost small" onClick={addStarter} disabled={loadingStarter}>
              + Стартовая колода
            </button>
            {error && <span className="error small">{error}</span>}
          </div>
        </>
      )}

      {creating && (
        <CreateDeckModal
          onClose={() => setCreating(false)}
          onCreated={(id) => navigate(`/deck/${id}`)}
        />
      )}
    </div>
  );
}

function CreateDeckModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return (
    <Modal title="Новая колода" onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const d = await createDeck(name, description);
          onCreated(d.id);
        }}
      >
        <label className="field">
          Название
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например, IELTS или Phrasal verbs"
          />
        </label>
        <label className="field">
          Описание (необязательно)
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="row">
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={!name.trim()}>
            Создать
          </button>
        </div>
      </form>
    </Modal>
  );
}
