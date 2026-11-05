import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { deleteCard, moveCard, resetCard, updateCardContent } from '../../db/repo';
import { Modal } from '../../components/Modal';
import { formatDelay } from '../../lib/dates';
import { NotFound } from '../decks/DeckPage';
import { CardForm } from './CardForm';

const STATE_LABEL = {
  new: 'новая',
  learning: 'изучается',
  review: 'выучена',
  relearning: 'переучивается',
} as const;

export function EditCardPage() {
  const { cardId = '' } = useParams();
  const [params] = useSearchParams();
  const back = params.get('back');
  const navigate = useNavigate();
  const card = useLiveQuery(() => db.cards.get(cardId), [cardId]);
  const decks = useLiveQuery(() => db.decks.orderBy('createdAt').toArray(), []);
  const [confirm, setConfirm] = useState<'delete' | 'reset' | null>(null);

  if (card === undefined) return null;
  if (!card) return <NotFound />;

  const goBack = () => (back ? navigate(back) : navigate(`/deck/${card.deckId}/cards`));
  const now = Date.now();

  return (
    <div className="stack">
      <div className="small">
        <button className="btn ghost small" style={{ minHeight: 0, padding: 0 }} onClick={goBack}>
          ← Назад
        </button>
      </div>
      <h1>Редактирование</h1>
      <div className="panel">
        <CardForm
          initial={card}
          submitLabel="Сохранить"
          onCancel={goBack}
          onSubmit={async (c) => {
            await updateCardContent(card.id, c);
            goBack();
          }}
        />
      </div>

      <div className="panel stack">
        <div className="small muted">
          Состояние: <strong>{STATE_LABEL[card.state]}</strong>
          {card.state !== 'new' && (
            <>
              {' '}
              · следующий показ:{' '}
              {card.due <= now ? 'сейчас' : `через ${formatDelay(card.due - now)}`}
              {card.state === 'review' && <> · интервал {card.interval} д.</>} · лёгкость{' '}
              {Math.round(card.ease * 100)}% · повторений {card.reps} · ошибок {card.lapses}
            </>
          )}
        </div>
        <div className="row">
          {decks && decks.length > 1 && (
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center' }}>
              Колода:
              <select
                value={card.deckId}
                onChange={(e) => moveCard(card.id, e.target.value)}
                style={{ width: 'auto' }}
              >
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="spacer" />
          <Link className="btn ghost" to={`/deck/${card.deckId}`}>
            К колоде
          </Link>
          <button className="btn ghost" onClick={() => setConfirm('reset')}>
            Сбросить прогресс
          </button>
          <button className="btn ghost danger" onClick={() => setConfirm('delete')}>
            Удалить
          </button>
        </div>
      </div>

      {confirm && (
        <Modal
          title={confirm === 'delete' ? 'Удалить карточку?' : 'Сбросить прогресс?'}
          onClose={() => setConfirm(null)}
        >
          <p style={{ margin: 0 }}>
            {confirm === 'delete'
              ? `Карточка «${card.word}» и её история будут удалены.`
              : `Карточка «${card.word}» снова станет новой.`}
          </p>
          <div className="row">
            <div className="spacer" />
            <button className="btn" onClick={() => setConfirm(null)}>
              Отмена
            </button>
            <button
              className="btn primary"
              onClick={async () => {
                if (confirm === 'delete') {
                  await deleteCard(card.id);
                  goBack();
                } else {
                  await resetCard(card.id);
                  setConfirm(null);
                }
              }}
            >
              {confirm === 'delete' ? 'Удалить' : 'Сбросить'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
