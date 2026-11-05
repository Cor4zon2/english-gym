import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { parseApkg, type AnkiCollection } from './apkg';

let sql: Promise<SqlJsStatic> | null = null;

/** Read an Anki package in the browser. This module is loaded lazily: sql.js is ~700 KB of wasm. */
export async function readApkgFile(file: File): Promise<AnkiCollection> {
  sql ??= initSqlJs({ locateFile: () => wasmUrl });
  const SQL = await sql.catch((e) => {
    sql = null;
    throw e;
  });
  return parseApkg(SQL, new Uint8Array(await file.arrayBuffer()));
}
