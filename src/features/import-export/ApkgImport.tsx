import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Deck } from '../../types';
import type { AnkiCollection } from '../../lib/anki/apkg';
import {
  TARGET_FIELDS,
  TARGET_LABELS,
  convertCollection,
  deckDisplayName,
  guessMapping,
  usedNoteTypes,
  type FieldMapping,
  type TargetField,
} from '../../lib/anki/convert';
import { importAnkiNotes } from '../../db/ankiImport';

const AS_IN_ANKI = '__anki__';
const NEW_DECK = '__new__';

export function ApkgImport({ decks }: { decks: Deck[] }) {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [file, setFile] = useState<{ name: string; col: AnkiCollection } | null>(null);
  const [mappings, setMappings] = useState<Record<string, FieldMapping>>({});
  const [target, setTarget] = useState(AS_IN_ANKI);
  const [newName, setNewName] = useState('');
  const [keepProgress, setKeepProgress] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const col = file?.col;
  const types = useMemo(() => (col ? usedNoteTypes(col) : []), [col]);
  const converted = useMemo(() => (col ? convertCollection(col, mappings) : null), [col, mappings]);
  const usedDecks = useMemo(() => {
    if (!col || !converted) return [];
    const counts = new Map<string, number>();
    for (const n of converted.notes) counts.set(n.ankiDeckId, (counts.get(n.ankiDeckId) ?? 0) + 1);
    return col.decks
      .filter((d) => counts.has(d.id))
      .map((d) => ({ ...d, count: counts.get(d.id)! }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [col, converted]);
  const studied = useMemo(
    () => col?.notes.filter((n) => n.sched && n.sched.type !== 0).length ?? 0,
    [col],
  );

  const onFile = async (f: File) => {
    setError('');
    setMsg('');
    setFile(null);
    setLoading(true);
    try {
      const { readApkgFile } = await import('../../lib/anki/load');
      const parsed = await readApkgFile(f);
      if (!parsed.notes.length) throw new Error('В колоде нет карточек');
      setMappings(Object.fromEntries(parsed.noteTypes.map((t) => [t.id, guessMapping(t.fields)])));
      const base = f.name.replace(/\.(apkg|colpkg)$/i, '');
      setNewName(base);
      setTarget(AS_IN_ANKI);
      setFile({ name: f.name, col: parsed });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (input.current) input.current.value = '';
    } finally {
      setLoading(false);
    }
  };

  const setField = (typeId: string, field: TargetField, index: number) =>
    setMappings((m) => ({ ...m, [typeId]: { ...m[typeId], [field]: index } }));

  const reset = () => {
    setFile(null);
    if (input.current) input.current.value = '';
  };

  const doImport = async () => {
    if (!col || !converted?.notes.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await importAnkiNotes(col, converted.notes, {
        target:
          target === AS_IN_ANKI
            ? { kind: 'anki' }
            : target === NEW_DECK
              ? { kind: 'new', name: newName.trim() }
              : { kind: 'deck', deckId: target },
        keepProgress,
        skipDuplicates,
      });
      reset();
      setMsg(
        `Импортировано карточек: ${res.added}` +
          (res.duplicates ? `, пропущено дубликатов: ${res.duplicates}` : ''),
      );
      if (res.deckIds.length === 1) navigate(`/deck/${res.deckIds[0]}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel stack">
      <h2 style={{ margin: 0 }}>Импорт из Anki (.apkg)</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Колоды, экспортированные из Anki (<em>Файл → Экспорт → Колода Anki</em>), а также полные
        бэкапы <code>.colpkg</code>. Поля заметок сопоставляются с полями карточки автоматически —
        проверьте и при необходимости поправьте. HTML-оформление, картинки и аудио не переносятся.
      </p>
      <input
        ref={input}
        type="file"
        accept=".apkg,.colpkg"
        disabled={loading || busy}
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {loading && <p className="small muted">Читаем колоду…</p>}

      {file && col && converted && (
        <div className="stack">
          <p className="notice small" style={{ margin: 0 }}>
            {file.name}: заметок — <strong>{col.notes.length}</strong>, готово к импорту —{' '}
            <strong>{converted.notes.length}</strong>
            {converted.skipped > 0 && ` (без слова или перевода: ${converted.skipped})`}
            {studied > 0 && `, с историей повторений — ${studied}`}
          </p>

          {types.map((t) => (
            <NoteTypeMapping
              key={t.id}
              name={t.name}
              noteCount={t.noteCount}
              fields={t.fields}
              mapping={mappings[t.id]}
              onChange={(field, i) => setField(t.id, field, i)}
            />
          ))}

          {converted.notes.length > 0 && (
            <div className="small">
              <strong>Пример:</strong>
              <ul style={{ margin: '4px 0 0' }}>
                {converted.notes.slice(0, 3).map((n, i) => (
                  <li key={i}>
                    <strong>{n.content.word}</strong> — {n.content.translation}
                    {n.content.examples[0] && (
                      <span className="muted"> · “{n.content.examples[0]}”</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {converted.notes.length > 0 && (
            <>
              <div className="row">
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  style={{ width: 'auto' }}
                >
                  <option value={AS_IN_ANKI}>
                    {usedDecks.length > 1
                      ? `Как в Anki (колод: ${usedDecks.length})`
                      : `Как в Anki («${deckDisplayName(usedDecks[0]?.name ?? 'Anki')}»)`}
                  </option>
                  <option value={NEW_DECK}>В новую колоду…</option>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {target === NEW_DECK && (
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Название колоды"
                    style={{ width: 'auto', flex: 1, minWidth: 160 }}
                  />
                )}
              </div>
              {target === AS_IN_ANKI && usedDecks.length > 1 && (
                <p className="small muted" style={{ margin: 0 }}>
                  {usedDecks.map((d) => `${deckDisplayName(d.name)} (${d.count})`).join(', ')}
                </p>
              )}
              <label className="small row" style={{ gap: 6 }}>
                <input
                  type="checkbox"
                  checked={keepProgress}
                  onChange={(e) => setKeepProgress(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                перенести прогресс повторений из Anki (интервалы, лёгкость, даты)
              </label>
              <label className="small row" style={{ gap: 6 }}>
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                пропускать слова, которые уже есть в колоде
              </label>
              <div className="row">
                <button
                  className="btn primary"
                  onClick={doImport}
                  disabled={busy || (target === NEW_DECK && !newName.trim())}
                >
                  {busy ? 'Импортируем…' : 'Импортировать'}
                </button>
                <button className="btn" onClick={reset} disabled={busy}>
                  Отмена
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {msg && <p className="small">{msg}</p>}
      {error && <p className="small error">Ошибка: {error}</p>}
    </section>
  );
}

function NoteTypeMapping(props: {
  name: string;
  noteCount: number;
  fields: string[];
  mapping: FieldMapping | undefined;
  onChange: (field: TargetField, index: number) => void;
}) {
  const { name, noteCount, fields, mapping, onChange } = props;
  if (!mapping) return null;
  return (
    <details open={noteCount > 0}>
      <summary className="small">
        Тип заметок <strong>{name}</strong> — {noteCount}
      </summary>
      <div className="grid-2" style={{ marginTop: 8 }}>
        {TARGET_FIELDS.map((f) => (
          <label key={f} className="small stack" style={{ gap: 4 }}>
            <span>
              {TARGET_LABELS[f]}
              {(f === 'word' || f === 'translation') && ' *'}
            </span>
            <select value={mapping[f]} onChange={(e) => onChange(f, Number(e.target.value))}>
              <option value={-1}>—</option>
              {fields.map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </details>
  );
}
