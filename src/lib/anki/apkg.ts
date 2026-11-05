import { unzipSync } from 'fflate';
import { decompress as zstdDecompress } from 'fzstd';
import type { Database, SqlJsStatic, SqlValue } from 'sql.js';

/** Raw scheduling data of an Anki card (columns of the `cards` table). */
export interface AnkiSched {
  type: number; // 0 new, 1 learning, 2 review, 3 relearning
  queue: number; // -3/-2 buried, -1 suspended, 0 new, 1 learn, 2 review, 3 day-learn, 4 preview
  due: number;
  ivl: number; // days (negative = seconds, for learning cards)
  factor: number; // ease ×1000
  reps: number;
  lapses: number;
}

export interface AnkiNoteType {
  id: string;
  name: string;
  fields: string[];
  isCloze: boolean;
}

export interface AnkiDeck {
  id: string;
  /** Full path, levels joined with "::" (as Anki shows it). */
  name: string;
}

export interface AnkiNote {
  id: string;
  noteTypeId: string;
  fields: string[];
  tags: string[];
  /** Deck of the note's first card. */
  deckId: string;
  /** Scheduling of the note's first card (template ord 0 / lowest ord). */
  sched?: AnkiSched;
}

export interface AnkiCollection {
  /** Collection creation time, seconds since epoch — review due dates are days from it. */
  crt: number;
  noteTypes: AnkiNoteType[];
  decks: AnkiDeck[];
  notes: AnkiNote[];
}

const COLLECTION_FILES = ['collection.anki21b', 'collection.anki21', 'collection.anki2'];
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

/** Extract the SQLite collection from an .apkg / .colpkg (zip) file. */
export function extractCollection(zip: Uint8Array): Uint8Array {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip, { filter: (f) => COLLECTION_FILES.includes(f.name) });
  } catch {
    throw new Error('Файл повреждён или это не колода Anki (.apkg)');
  }
  const name = COLLECTION_FILES.find((n) => files[n]);
  if (!name) throw new Error('В архиве нет коллекции Anki (collection.anki2/anki21)');
  let data = files[name];
  if (ZSTD_MAGIC.every((b, i) => data[i] === b)) data = zstdDecompress(data);
  return data;
}

type Row = Record<string, SqlValue>;

function rows(db: Database, sql: string): Row[] {
  const out: Row[] = [];
  const stmt = db.prepare(sql);
  try {
    while (stmt.step()) out.push(stmt.getAsObject());
  } finally {
    stmt.free();
  }
  return out;
}

function hasTable(db: Database, name: string): boolean {
  return (
    rows(db, `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`).length > 0
  );
}

const str = (v: SqlValue) => (v == null ? '' : String(v));
const num = (v: SqlValue) => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

/** NotetypeConfig protobuf: field 1 (`kind`) is a varint, 1 = cloze. Proto3 omits the default 0. */
function protoKindIsCloze(config: SqlValue): boolean {
  return config instanceof Uint8Array && config[0] === 0x08 && config[1] === 0x01;
}

function readNoteTypes(db: Database, col: Row): AnkiNoteType[] {
  // Schema 18+ (Anki 2.1.28+): separate tables.
  if (hasTable(db, 'notetypes')) {
    const fields = new Map<string, { ord: number; name: string }[]>();
    for (const f of rows(db, 'SELECT ntid, ord, name FROM fields')) {
      const id = str(f.ntid);
      if (!fields.has(id)) fields.set(id, []);
      fields.get(id)!.push({ ord: num(f.ord), name: str(f.name) });
    }
    return rows(db, 'SELECT id, name, config FROM notetypes').map((r) => ({
      id: str(r.id),
      name: str(r.name),
      fields: (fields.get(str(r.id)) ?? []).sort((a, b) => a.ord - b.ord).map((f) => f.name),
      isCloze: protoKindIsCloze(r.config),
    }));
  }
  // Schema 11: JSON in col.models.
  const models = JSON.parse(str(col.models) || '{}') as Record<
    string,
    { id: number | string; name: string; type?: number; flds: { name: string; ord: number }[] }
  >;
  return Object.values(models).map((m) => ({
    id: String(m.id),
    name: m.name,
    fields: [...m.flds].sort((a, b) => a.ord - b.ord).map((f) => f.name),
    isCloze: m.type === 1,
  }));
}

function readDecks(db: Database, col: Row): AnkiDeck[] {
  if (hasTable(db, 'decks')) {
    return rows(db, 'SELECT id, name FROM decks').map((r) => ({
      id: str(r.id),
      name: str(r.name).split('\x1f').join('::'),
    }));
  }
  const decks = JSON.parse(str(col.decks) || '{}') as Record<string, { id: number; name: string }>;
  return Object.values(decks).map((d) => ({ id: String(d.id), name: d.name }));
}

export function readCollection(SQL: SqlJsStatic, sqlite: Uint8Array): AnkiCollection {
  let db: Database;
  try {
    db = new SQL.Database(sqlite);
  } catch {
    throw new Error('Не удалось открыть базу данных Anki');
  }
  try {
    const col = rows(db, 'SELECT * FROM col LIMIT 1')[0];
    if (!col) throw new Error('Коллекция Anki пуста');
    const noteTypes = readNoteTypes(db, col);
    const decks = readDecks(db, col);

    // First card of each note: lowest template ord, then lowest id.
    const firstCard = new Map<string, { did: string; ord: number; id: number; sched: AnkiSched }>();
    for (const c of rows(
      db,
      'SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards',
    )) {
      const nid = str(c.nid);
      const ord = num(c.ord);
      const id = num(c.id);
      const prev = firstCard.get(nid);
      if (prev && (prev.ord < ord || (prev.ord === ord && prev.id < id))) continue;
      firstCard.set(nid, {
        did: str(c.did),
        ord,
        id,
        sched: {
          type: num(c.type),
          queue: num(c.queue),
          due: num(c.due),
          ivl: num(c.ivl),
          factor: num(c.factor),
          reps: num(c.reps),
          lapses: num(c.lapses),
        },
      });
    }

    const notes: AnkiNote[] = rows(db, 'SELECT id, mid, flds, tags FROM notes ORDER BY id').map(
      (n) => {
        const card = firstCard.get(str(n.id));
        return {
          id: str(n.id),
          noteTypeId: str(n.mid),
          fields: str(n.flds).split('\x1f'),
          tags: str(n.tags).split(/\s+/).filter(Boolean),
          deckId: card?.did ?? '1',
          sched: card?.sched,
        };
      },
    );

    return { crt: num(col.crt), noteTypes, decks, notes };
  } finally {
    db.close();
  }
}

/** Parse an .apkg/.colpkg file into a plain collection. */
export function parseApkg(SQL: SqlJsStatic, zip: Uint8Array): AnkiCollection {
  return readCollection(SQL, extractCollection(zip));
}
