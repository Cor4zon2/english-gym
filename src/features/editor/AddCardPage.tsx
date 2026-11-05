import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { addCards } from '../../db/repo';
import { NotFound } from '../decks/DeckPage';
import { CardForm } from './CardForm';
import { emptyContent } from './emptyContent';

export function AddCardPage() {
  const { deckId = '' } = useParams();
  const deck = useLiveQuery(() => db.decks.get(deckId), [deckId]);
  const [formKey, setFormKey] = useState(0);
  const [added, setAdded] = useState<string[]>([]);

  if (deck === undefined) return null;
  if (!deck) return <NotFound />;

  return (
    <div className="stack">
      <div className="small">
        <Link to={`/deck/${deckId}`}>← {deck.name}</Link>
      </div>
      <h1>Новая карточка</h1>
      <div className="panel">
        <CardForm
          key={formKey}
          initial={emptyContent()}
          submitLabel="Добавить"
          onSubmit={async (c) => {
            await addCards(deckId, [c]);
            setAdded((a) => [c.word.trim(), ...a]);
            setFormKey((k) => k + 1);
          }}
        />
      </div>
      {added.length > 0 && (
        <p className="notice small" style={{ margin: 0 }}>
          Добавлено: {added.slice(0, 8).join(', ')}
          {added.length > 8 ? ` и ещё ${added.length - 8}` : ''}
        </p>
      )}
    </div>
  );
}
