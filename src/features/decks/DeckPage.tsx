import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { deleteDeck, updateDeck } from '../../db/repo';
import { Modal } from '../../components/Modal';
import { useNow } from '../../lib/useNow';
import { cardsToCsv } from '../../lib/csv';
import { downloadFile, safeFileName } from '../../lib/download';
import { useDeckCounts } from './useDeckCounts';
import { DeckSettingsModal } from './DeckSettingsModal';
import styles from './Decks.module.css';

export function DeckPage() {
  const { deckId = '' } = useParams();
  const now = useNow();
  const deck = useLiveQuery(() => db.decks.get(deckId), [deckId]);
  const states = useLiveQuery(async () => {
    const out = { new: 0, learning: 0, review: 0, relearning: 0 };
    await db.cards
      .where('deckId')
      .equals(deckId)
      .each((c) => out[c.state]++);
    return out;
  }, [deckId]);
  const counts = useDeckCounts(now)?.[deckId];
  const navigate = useNavigate();
  const [modal, setModal] = useState<'settings' | 'rename' | 'delete' | null>(null);

  if (deck === undefined) return null;
  if (deck === null || !deck) return <NotFound />;

  const total = states ? Object.values(states).reduce((a, b) => a + b, 0) : 0;
  const todo = counts ? counts.new + counts.learn + counts.due : 0;

  const exportCsv = async () => {
    const cards = await db.cards.where('deckId').equals(deckId).sortBy('createdAt');
    downloadFile(`${safeFileName(deck.name)}.csv`, cardsToCsv(cards), 'text/csv;charset=utf-8');
  };

  return (
    <div className="stack">
      <div className="small">
        <Link to="/">← Все колоды</Link>
      </div>
      <div className="row">
        <div>
          <h1 style={{ marginBottom: 4 }}>{deck.name}</h1>
          {deck.description && (
            <p className="muted" style={{ margin: 0 }}>
              {deck.description}
            </p>
          )}
        </div>
      </div>

      <div className="panel stack">
        <div className={styles.stats}>
          <div>
            <div className={`${styles.big} count-new`}>{counts?.new ?? '·'}</div>
            <div className="small muted">Новые</div>
          </div>
          <div>
            <div className={`${styles.big} count-learn`}>{counts?.learn ?? '·'}</div>
            <div className="small muted">Изучаемые</div>
          </div>
          <div>
            <div className={`${styles.big} count-due`}>{counts?.due ?? '·'}</div>
            <div className="small muted">К повторению</div>
          </div>
        </div>
        {total === 0 ? (
          <p className="muted" style={{ textAlign: 'center', margin: 0 }}>
            В колоде пока нет карточек.
          </p>
        ) : todo === 0 ? (
          <p className="muted" style={{ textAlign: 'center', margin: 0 }}>
            На сегодня всё! Возвращайтесь завтра 💪
          </p>
        ) : null}
        <button
          className="btn primary"
          style={{ minHeight: 48, fontSize: '1.05rem' }}
          disabled={todo === 0}
          onClick={() => navigate(`/deck/${deckId}/review`)}
        >
          Начать занятие
        </button>
      </div>

      <div className="row">
        <Link className="btn" to={`/deck/${deckId}/add`}>
          + Добавить карточку
        </Link>
        <Link className="btn" to={`/deck/${deckId}/cards`}>
          Все карточки ({total})
        </Link>
        <button className="btn" onClick={() => setModal('settings')}>
          ⚙️ Настройки
        </button>
        <button className="btn" onClick={exportCsv} disabled={total === 0}>
          ⬇ CSV
        </button>
        <div className="spacer" />
        <button className="btn ghost" onClick={() => setModal('rename')}>
          Переименовать
        </button>
        <button className="btn ghost danger" onClick={() => setModal('delete')}>
          Удалить
        </button>
      </div>

      {states && total > 0 && (
        <p className="small muted" style={{ margin: 0 }}>
          Всего: {total} · новых {states.new} · изучаются {states.learning + states.relearning} ·
          выучено {states.review}
        </p>
      )}

      {modal === 'settings' && <DeckSettingsModal deck={deck} onClose={() => setModal(null)} />}
      {modal === 'rename' && (
        <RenameModal
          name={deck.name}
          description={deck.description ?? ''}
          onClose={() => setModal(null)}
          onSave={async (name, description) => {
            await updateDeck(deckId, { name, description: description || undefined });
            setModal(null);
          }}
        />
      )}
      {modal === 'delete' && (
        <Modal title="Удалить колоду?" onClose={() => setModal(null)}>
          <p style={{ margin: 0 }}>
            Колода «{deck.name}», все её карточки ({total}) и история повторений будут удалены
            безвозвратно.
          </p>
          <div className="row">
            <div className="spacer" />
            <button className="btn" onClick={() => setModal(null)}>
              Отмена
            </button>
            <button
              className="btn primary"
              style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={async () => {
                await deleteDeck(deckId);
                navigate('/');
              }}
            >
              Удалить
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RenameModal(props: {
  name: string;
  description: string;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
}) {
  const [name, setName] = useState(props.name);
  const [description, setDescription] = useState(props.description);
  return (
    <Modal title="Переименовать колоду" onClose={props.onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) props.onSave(name.trim(), description.trim());
        }}
      >
        <label className="field">
          Название
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Описание
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="row">
          <div className="spacer" />
          <button type="button" className="btn" onClick={props.onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={!name.trim()}>
            Сохранить
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function NotFound() {
  return (
    <div className="panel empty stack">
      <h2>Не найдено</h2>
      <Link to="/">На главную</Link>
    </div>
  );
}
