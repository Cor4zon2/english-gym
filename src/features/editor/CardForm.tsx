import { useState } from 'react';
import type { CardContent } from '../../types';
import { speak, speechSupported } from '../../lib/speech';

interface Props {
  initial: CardContent;
  submitLabel: string;
  onSubmit: (c: CardContent) => Promise<void> | void;
  onCancel?: () => void;
  extra?: React.ReactNode;
}

/** Form for card content. Lists (examples, collocations) are edited one item per line. */
export function CardForm({ initial, submitLabel, onSubmit, onCancel, extra }: Props) {
  const [f, setF] = useState({
    word: initial.word,
    translation: initial.translation,
    partOfSpeech: initial.partOfSpeech ?? '',
    transcription: initial.transcription ?? '',
    definition: initial.definition ?? '',
    examples: initial.examples.join('\n'),
    collocations: initial.collocations.join('\n'),
    tags: initial.tags.join(' '),
    notes: initial.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set =
    (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: e.target.value });

  const valid = f.word.trim() && f.translation.trim();
  const lines = (s: string) => s.split('\n');

  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || busy) return;
        setBusy(true);
        try {
          await onSubmit({
            word: f.word,
            translation: f.translation,
            partOfSpeech: f.partOfSpeech,
            transcription: f.transcription,
            definition: f.definition,
            examples: lines(f.examples),
            collocations: lines(f.collocations),
            tags: f.tags.split(/[\s,]+/),
            notes: f.notes,
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid-2">
        <label className="field">
          Слово *
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input autoFocus value={f.word} onChange={set('word')} placeholder="напр. meticulous" />
            {speechSupported && (
              <button
                type="button"
                className="btn icon"
                title="Произнести"
                onClick={() => speak(f.word)}
                disabled={!f.word.trim()}
              >
                🔊
              </button>
            )}
          </div>
        </label>
        <label className="field">
          Перевод *
          <input value={f.translation} onChange={set('translation')} placeholder="напр. дотошный" />
        </label>
        <label className="field">
          Часть речи
          <input value={f.partOfSpeech} onChange={set('partOfSpeech')} placeholder="напр. adj." />
        </label>
        <label className="field">
          Транскрипция
          <input
            value={f.transcription}
            onChange={set('transcription')}
            placeholder="напр. /məˈtɪkjələs/"
          />
        </label>
      </div>
      <label className="field">
        Определение (EN)
        <input
          value={f.definition}
          onChange={set('definition')}
          placeholder="напр. showing great attention to detail"
        />
      </label>
      <label className="field">
        Примеры — по одному на строку
        <textarea
          value={f.examples}
          onChange={set('examples')}
          placeholder="напр. She kept meticulous records of every transaction."
        />
      </label>
      <label className="field">
        Коллокации — по одной на строку
        <textarea
          value={f.collocations}
          onChange={set('collocations')}
          placeholder={'напр. meticulous attention\nmeticulous planning'}
        />
      </label>
      <div className="grid-2">
        <label className="field">
          Теги (через пробел)
          <input value={f.tags} onChange={set('tags')} placeholder="напр. ielts b2" />
        </label>
        <label className="field">
          Заметка
          <input value={f.notes} onChange={set('notes')} />
        </label>
      </div>
      <div className="row">
        {extra}
        <div className="spacer" />
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Отмена
          </button>
        )}
        <button className="btn primary" disabled={!valid || busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
