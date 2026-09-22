/**
 * SQLite storage for the waitlist, on node:sqlite (built in from Node 22.5).
 * One row per address: a second submission from the same address updates the
 * details it came with and keeps the original work order reference.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDatabase(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS signups (
      email      TEXT PRIMARY KEY,
      company    TEXT NOT NULL DEFAULT '',
      size       TEXT NOT NULL DEFAULT '',
      role       TEXT NOT NULL DEFAULT '',
      workflow   TEXT NOT NULL DEFAULT '',
      ref        TEXT NOT NULL,
      source     TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS signups_created_at ON signups (created_at)");
  return db;
}

export function insertSignup(db, entry) {
  const existing = db.prepare("SELECT * FROM signups WHERE email = ?").get(entry.email);

  if (existing) {
    /* Someone signing up a second time usually fills in less, not more. Keep
       what they told us the first time unless this submission replaces it,
       and keep the original work order reference either way. */
    const keep = (field) => (entry[field] ? entry[field] : existing[field]);
    db.prepare(`
      UPDATE signups
         SET company = ?, size = ?, role = ?, workflow = ?, source = ?, user_agent = ?, updated_at = ?
       WHERE email = ?
    `).run(keep("company"), keep("size"), keep("role"), keep("workflow"), keep("source"), keep("user_agent"), entry.created_at, entry.email);
    return { ref: existing.ref, returning: true };
  }

  db.prepare(`
    INSERT INTO signups (email, company, size, role, workflow, ref, source, user_agent, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(entry.email, entry.company, entry.size, entry.role, entry.workflow, entry.ref, entry.source, entry.user_agent, entry.created_at, entry.created_at);

  return { ref: entry.ref, returning: false };
}

export function countSignups(db) {
  return db.prepare("SELECT COUNT(*) AS n FROM signups").get().n;
}

export function listSignups(db) {
  return db.prepare("SELECT * FROM signups ORDER BY created_at ASC").all();
}
