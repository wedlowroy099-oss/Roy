/**
 * Millwright — landing page + waitlist service.
 *
 * Zero dependencies: node:http for the server, node:sqlite for storage.
 * Requires Node 22.5+ (node:sqlite is built in from that release).
 *
 *   node server/server.js
 *
 * Environment:
 *   PORT                    default 3000
 *   MILLWRIGHT_DB           default data/waitlist.db
 *   MILLWRIGHT_ADMIN_TOKEN  required to read the list back out
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase, insertSignup, countSignups, listSignups } from "./db.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.MILLWRIGHT_ADMIN_TOKEN || "";

const db = openDatabase(process.env.MILLWRIGHT_DB || join(ROOT, "data", "waitlist.db"));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon"
};

/* One signup per address per window, and a ceiling per address regardless of
   how the client behaves. Keyed on the client IP; adequate for a waitlist,
   and the place to swap in a shared store if this ever runs on more than one
   process. */
const RATE_LIMIT = { windowMs: 60_000, max: 5 };
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const record = hits.get(ip);
  if (!record || now - record.start > RATE_LIMIT.windowMs) {
    hits.set(ip, { start: now, count: 1 });
    if (hits.size > 10_000) {
      for (const [key, value] of hits) {
        if (now - value.start > RATE_LIMIT.windowMs) hits.delete(key);
      }
    }
    return false;
  }
  record.count += 1;
  return record.count > RATE_LIMIT.max;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  res.end(payload);
}

async function readBody(req, limitBytes = 32_768) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new Error("payload too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  const type = req.headers["content-type"] || "";
  if (type.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return JSON.parse(raw);
}

function clean(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function workOrderRef(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let tail = "";
  for (let i = 0; i < 4; i++) tail += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `WO-${yy}${mm}-${tail}`;
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function serveStatic(req, res, pathname) {
  const relative = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.[/\\])+/, "");
  const file = join(PUBLIC_DIR, relative);
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: "Forbidden" });
  try {
    const content = await readFile(file);
    res.writeHead(200, {
      "Content-Type": MIME[extname(file)] || "application/octet-stream",
      "Cache-Control": relative === "/index.html" ? "no-cache" : "public, max-age=3600"
    });
    res.end(content);
  } catch {
    send(res, 404, { error: "Not found" });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "unknown";

  if (req.method === "POST" && url.pathname === "/api/waitlist") {
    if (rateLimited(ip)) {
      return send(res, 429, { error: "That's a few too many submissions in a row. Give it a minute." });
    }
    let body;
    try {
      body = await readBody(req);
    } catch {
      return send(res, 400, { error: "We couldn't read that submission. Try again." });
    }

    if (clean(body.company_url)) return send(res, 200, { ok: true, ref: workOrderRef() }); // honeypot

    const email = clean(body.email, 254).toLowerCase();
    if (!EMAIL.test(email)) {
      return send(res, 400, { error: "That email address doesn't look complete. Check it and try again." });
    }

    const ref = clean(body.ref, 32) || workOrderRef();
    try {
      const result = insertSignup(db, {
        email,
        company: clean(body.company, 120),
        size: clean(body.size, 20),
        role: clean(body.role, 120),
        workflow: clean(body.workflow, 2000),
        ref,
        source: clean(body.source, 120),
        user_agent: clean(req.headers["user-agent"], 300),
        created_at: new Date().toISOString()
      });
      return send(res, 200, { ok: true, ref: result.ref, returning: result.returning });
    } catch (error) {
      console.error("waitlist insert failed:", error);
      return send(res, 500, { error: "We couldn't save that. Try again in a moment." });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/waitlist/count") {
    return send(res, 200, { count: countSignups(db) }, { "Cache-Control": "no-store" });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/export.csv") {
    const provided = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!ADMIN_TOKEN || provided !== ADMIN_TOKEN) {
      return send(res, 401, { error: "Unauthorized" });
    }
    const rows = listSignups(db);
    const columns = ["created_at", "email", "company", "role", "size", "workflow", "ref", "source"];
    const csv = [columns.join(",")]
      .concat(rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")))
      .join("\n");
    return send(res, 200, csv, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="millwright-waitlist.csv"',
      "Cache-Control": "no-store"
    });
  }

  if (req.method === "GET" || req.method === "HEAD") {
    return serveStatic(req, res, url.pathname);
  }

  send(res, 405, { error: "Method not allowed" });
});

server.listen(PORT, () => {
  console.log(`Millwright listening on http://localhost:${PORT}`);
  if (!ADMIN_TOKEN) {
    console.warn("MILLWRIGHT_ADMIN_TOKEN is unset — /api/admin/export.csv will refuse every request.");
  }
});
