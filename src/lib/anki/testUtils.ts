// Helpers for building synthetic Anki packages in tests.
import { zipSync, strToU8 } from 'fflate';
import type { SqlJsStatic } from 'sql.js';

export interface FixtureNote {
  id: number;
  mid: number;
  fields: string[];
  tags?: string;
  cards: {
    id: number;
    did: number;
    ord?: number;
    type?: number;
    queue?: number;
    due?: number;
    ivl?: number;
    factor?: number;
    reps?: number;
    lapses?: number;
  }[];
}

export interface FixtureNoteType {
  id: number;
  name: string;
  fields: string[];
  cloze?: boolean;
}

export interface Fixture {
  crt: number;
  noteTypes: FixtureNoteType[];
  decks: { id: number; name: string }[];
  notes: FixtureNote[];
}

const CORE = `
  CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer,
    tags text, flds text, sfld text, csum integer, flags integer, data text);
  CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer,
    usn integer, type integer, queue integer, due integer, ivl integer, factor integer,
    reps integer, lapses integer, left integer, odue integer, odid integer, flags integer,
    data text);
`;

function fillNotes(db: import('sql.js').Database, f: Fixture) {
  for (const n of f.notes) {
    db.run('INSERT INTO notes (id, guid, mid, mod, usn, tags, flds) VALUES (?,?,?,?,?,?,?)', [
      n.id,
      `g${n.id}`,
      n.mid,
      0,
      0,
      n.tags ?? '',
      n.fields.join('\x1f'),
    ]);
    for (const c of n.cards) {
      db.run(
        `INSERT INTO cards (id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          c.id,
          n.id,
          c.did,
          c.ord ?? 0,
          c.type ?? 0,
          c.queue ?? c.type ?? 0,
          c.due ?? 0,
          c.ivl ?? 0,
          c.factor ?? 0,
          c.reps ?? 0,
          c.lapses ?? 0,
        ],
      );
    }
  }
}

/** Legacy schema 11 (collection.anki2 / collection.anki21). */
export function buildSchema11(SQL: SqlJsStatic, f: Fixture): Uint8Array {
  const db = new SQL.Database();
  db.run(
    `CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer,
    ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text,
    dconf text, tags text);` + CORE,
  );
  const models = Object.fromEntries(
    f.noteTypes.map((t) => [
      String(t.id),
      {
        id: t.id,
        name: t.name,
        type: t.cloze ? 1 : 0,
        flds: t.fields.map((name, ord) => ({ name, ord })),
      },
    ]),
  );
  const decks = Object.fromEntries(f.decks.map((d) => [String(d.id), d]));
  db.run('INSERT INTO col (id, crt, ver, models, decks) VALUES (1, ?, 11, ?, ?)', [
    f.crt,
    JSON.stringify(models),
    JSON.stringify(decks),
  ]);
  fillNotes(db, f);
  const out = db.export();
  db.close();
  return out;
}

/** Modern schema 18 (collection.anki21b, before zstd compression). */
export function buildSchema18(SQL: SqlJsStatic, f: Fixture): Uint8Array {
  const db = new SQL.Database();
  db.run(
    `CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer,
    ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text,
    dconf text, tags text);
    CREATE TABLE notetypes (id integer primary key, name text, mtime_secs integer, usn integer,
      config blob);
    CREATE TABLE fields (ntid integer, ord integer, name text, config blob,
      primary key (ntid, ord));
    CREATE TABLE decks (id integer primary key, name text, mtime_secs integer, usn integer,
      common blob, kind blob);` + CORE,
  );
  db.run("INSERT INTO col (id, crt, ver, models, decks) VALUES (1, ?, 18, '', '')", [f.crt]);
  for (const t of f.noteTypes) {
    db.run('INSERT INTO notetypes (id, name, config) VALUES (?,?,?)', [
      t.id,
      t.name,
      t.cloze ? new Uint8Array([0x08, 0x01, 0x10, 0x00]) : new Uint8Array([0x10, 0x00]),
    ]);
    t.fields.forEach((name, ord) =>
      db.run('INSERT INTO fields (ntid, ord, name) VALUES (?,?,?)', [t.id, ord, name]),
    );
  }
  for (const d of f.decks) {
    db.run('INSERT INTO decks (id, name) VALUES (?,?)', [d.id, d.name.split('::').join('\x1f')]);
  }
  fillNotes(db, f);
  const out = db.export();
  db.close();
  return out;
}

/** Wrap data in a valid zstd frame made of uncompressed (raw) blocks. */
export function zstdRaw(data: Uint8Array): Uint8Array {
  const MAX = 128 * 1024;
  const parts: number[] = [0x28, 0xb5, 0x2f, 0xfd, 0xa0];
  const n = data.length;
  parts.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
  for (let off = 0; off < n || off === 0; off += MAX) {
    const size = Math.min(MAX, n - off);
    const last = off + size >= n ? 1 : 0;
    const header = last | (size << 3); // block type 0 = raw
    parts.push(header & 0xff, (header >>> 8) & 0xff, (header >>> 16) & 0xff);
    for (let i = 0; i < size; i++) parts.push(data[off + i]);
    if (n === 0) break;
  }
  return new Uint8Array(parts);
}

export function zipPackage(files: Record<string, Uint8Array | string>): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v]),
    ),
  );
}
