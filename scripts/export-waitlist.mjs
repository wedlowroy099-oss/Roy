/**
 * Prints the waitlist as CSV, straight from the database file — no running
 * server and no admin token needed. For when you have shell access to the box.
 *
 *   npm run export > waitlist.csv
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase, listSignups } from "../server/db.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const db = openDatabase(process.env.MILLWRIGHT_DB || join(root, "data", "waitlist.db"));

const columns = ["created_at", "email", "company", "role", "size", "workflow", "ref", "source"];
const cell = (value) => {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const rows = listSignups(db);
console.log(columns.join(","));
for (const row of rows) console.log(columns.map((c) => cell(row[c])).join(","));
console.error(`${rows.length} signup${rows.length === 1 ? "" : "s"}`);
