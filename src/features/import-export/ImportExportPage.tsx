import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { addCards, createDeck, exportBackup, importBackup, isBackup } from '../../db/repo';
import { csvToCards, cardsToCsv } from '../../lib/csv';
import { dayKey } from '../../lib/dates';
import { downloadFile, safeFileName } from '../../lib/download';
import type { CardContent } from '../../types';

const NEW_DECK = '__new__';

export function ImportExportPage() {
  const decks = useLiveQuery(() => db.decks.orderBy('createdAt').toArray(), []);
  const navigate = useNavigate();

  // CSV import
  const [parsed, setParsed] = useState<{
    name: string;
    cards: CardContent[];
    errors: string[];
  } | null>(null);
  const [target, setTarget] = useState(NEW_DECK);
  const [newName, setNewName] = useState('');
  const [csvMsg, setCsvMsg] = useState('');

  // JSON restore
  const [jsonMsg, setJsonMsg] = useState('');
  const [replace, setReplace] = useState(false);
  const jsonInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);

  const onCsv = async (file: File) => {
    const res = csvToCards(await file.text());
    setParsed({ name: file.name, ...res });
    setNewName(file.name.replace(/\.csv$/i, ''));
    setCsvMsg('');
  };

  const doImportCsv = async () => {
    if (!parsed?.cards.length) return;
    let deckId = target;
    if (target === NEW_DECK) {
      if (!newName.trim()) return;
      deckId = (await createDeck(newName)).id;
    }
    const n = await addCards(deckId, parsed.cards);
    setParsed(null);
    if (csvInput.current) csvInput.current.value = '';
    setCsvMsg(`Импортировано карточек: ${n}`);
    navigate(`/deck/${deckId}`);
  };

  const onJson = async (file: File) => {
    setJsonMsg('');
    try {
      const data = JSON.parse(await file.text());
      if (!isBackup(data)) throw new Error('Это не резервная копия English Gym');
      if (
        replace &&
        !window.confirm('Все текущие колоды, карточки и история будут заменены. Продолжить?')
      )
        return;
      await importBackup(data, replace);
      setJsonMsg(
        `Восстановлено: колод ${data.decks.length}, карточек ${data.cards.length}, повторений ${data.logs.length}`,
      );
    } catch (e) {
      setJsonMsg(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (jsonInput.current) jsonInput.current.value = '';
    }
  };

  const exportJson = async () => {
    const b = await exportBackup();
    downloadFile(
      `english-gym-backup-${dayKey(Date.now())}.json`,
      JSON.stringify(b),
      'application/json',
    );
  };

  const exportCsv = async (deckId: string, name: string) => {
    const cards = await db.cards.where('deckId').equals(deckId).sortBy('createdAt');
    downloadFile(`${safeFileName(name)}.csv`, cardsToCsv(cards), 'text/csv;charset=utf-8');
  };

  if (!decks) return null;

  return (
    <div className="stack">
      <h1>Импорт и экспорт</h1>

      <section className="panel stack">
        <h2 style={{ margin: 0 }}>Импорт CSV</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Первая строка — заголовки. Обязательны <code>word</code> и <code>translation</code>; также
          поддерживаются{' '}
          <code>partOfSpeech, transcription, definition, examples, collocations, tags, notes</code>.
          Несколько примеров или коллокаций разделяйте символом <code>|</code>, теги — пробелом.
        </p>
        <input
          ref={csvInput}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => e.target.files?.[0] && onCsv(e.target.files[0])}
        />
        {parsed && (
          <div className="stack">
            <p className="notice small" style={{ margin: 0 }}>
              {parsed.name}: найдено карточек — <strong>{parsed.cards.length}</strong>
              {parsed.cards.length > 0 &&
                ` (${parsed.cards
                  .slice(0, 5)
                  .map((c) => c.word)
                  .join(', ')}${parsed.cards.length > 5 ? '…' : ''})`}
            </p>
            {parsed.errors.length > 0 && (
              <ul className="small error" style={{ margin: 0 }}>
                {parsed.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {parsed.errors.length > 10 && <li>…и ещё {parsed.errors.length - 10}</li>}
              </ul>
            )}
            {parsed.cards.length > 0 && (
              <div className="row">
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  style={{ width: 'auto' }}
                >
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
                <button
                  className="btn primary"
                  onClick={doImportCsv}
                  disabled={target === NEW_DECK && !newName.trim()}
                >
                  Импортировать
                </button>
              </div>
            )}
          </div>
        )}
        {csvMsg && <p className="small">{csvMsg}</p>}
      </section>

      <section className="panel stack">
        <h2 style={{ margin: 0 }}>Экспорт CSV</h2>
        {decks.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            Нет колод для экспорта.
          </p>
        ) : (
          <div className="row">
            {decks.map((d) => (
              <button key={d.id} className="btn" onClick={() => exportCsv(d.id, d.name)}>
                ⬇ {d.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="panel stack">
        <h2 style={{ margin: 0 }}>Резервная копия (JSON)</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Полный бэкап: колоды, карточки с прогрессом и история повторений. Используйте для переноса
          на другое устройство — данные хранятся только в этом браузере.
        </p>
        <div className="row">
          <button className="btn primary" onClick={exportJson}>
            ⬇ Скачать бэкап
          </button>
          <button className="btn" onClick={() => jsonInput.current?.click()}>
            ⬆ Восстановить из файла
          </button>
          <label className="small row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
              style={{ width: 'auto' }}
            />
            заменить текущие данные
          </label>
          <input
            ref={jsonInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => e.target.files?.[0] && onJson(e.target.files[0])}
          />
        </div>
        {jsonMsg && (
          <p className={`small ${jsonMsg.startsWith('Ошибка') ? 'error' : ''}`}>{jsonMsg}</p>
        )}
        {!replace && (
          <p className="small muted" style={{ margin: 0 }}>
            Без замены записи объединяются: совпадающие по id перезаписываются, остальные
            добавляются.
          </p>
        )}
      </section>

      <p className="small muted">
        <Link to="/">← К колодам</Link>
      </p>
    </div>
  );
}
