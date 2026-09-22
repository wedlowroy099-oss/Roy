# Millwright

**We install the machines that run your busywork.**

Landing page and waitlist for Millwright, an AI automation service. The pitch is
deliberately not "here is a tool": Millwright surveys the manual work inside a
business, builds the automation that does it, commissions it against an agreed
error tolerance, and stays on to maintain it.

## What's here

```
public/index.html          The landing page — one self-contained file
public/favicon.svg
server/server.js           Waitlist service: static hosting + JSON API
server/db.js               SQLite storage (node:sqlite, no dependencies)
scripts/build-artifact.mjs Builds dist/artifact.html from the landing page
scripts/export-waitlist.mjs Dumps the waitlist to CSV from the database file
```

No dependencies, no build step, no framework. Node 22.5 or newer (`node:sqlite`
is built in from that release).

## Run it

```bash
cp .env.example .env          # then set MILLWRIGHT_ADMIN_TOKEN
npm start                     # http://localhost:3000
```

## The waitlist

The landing page ships with **two storage adapters and picks one at runtime**,
so the same HTML works in both places it gets deployed:

| Where it runs | Where signups go |
| --- | --- |
| Self-hosted via `server/` | `POST /api/waitlist` → SQLite |
| Published as a Claude Artifact | The artifact's own database |

If neither is reachable (the page opened as a bare file, say), the form says so
plainly instead of pretending to have saved the address.

One row per email address. Signing up twice updates the details and keeps the
original work order reference; blank fields on a second submission don't erase
what was given the first time.

### API

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/waitlist` | JSON or form-encoded. Validates the address, honeypot-filters bots, rate-limits to 5/min per IP. |
| `GET` | `/api/waitlist/count` | Public count, for the figure on the page. |
| `GET` | `/api/admin/export.csv` | CSV of every signup. Requires `Authorization: Bearer $MILLWRIGHT_ADMIN_TOKEN`. |

Reading the list back out:

```bash
curl -H "Authorization: Bearer $MILLWRIGHT_ADMIN_TOKEN" \
  http://localhost:3000/api/admin/export.csv > waitlist.csv

npm run export > waitlist.csv    # or straight from the database file
```

## Deploying

The service is a single Node process serving `public/` and one SQLite file — it
runs anywhere that gives you a persistent disk (Fly, Render, Railway, a VM).
Point `MILLWRIGHT_DB` at a mounted volume so the waitlist survives restarts, and
put TLS in front of it.

To publish the page as a Claude Artifact instead, `npm run build:artifact` and
publish `dist/artifact.html`. Note that an artifact declaring a database is
organization-internal and can't be shared publicly — that route is for a live
internal preview, not for collecting public signups.

## Design notes

The page is set as a machine-shop drawing set, which is where a millwright
actually works. The sheet numbers (`A-1`…`A-4`), the dimension rule under the
hero, and the numbered install stages all encode something real — the drawing
order, the six-week timeline, and a genuine sequence — rather than decorating.

Typography is Archivo (display), IBM Plex Sans (body), IBM Plex Mono (data and
labels). The accent is the blue-green that machine tools are traditionally
painted; safety yellow is reserved for status and the one "out of scope" row.
Both light and dark themes are defined at token level, including the un-stamped
"system" state.

The cycle-time figures on the page are labelled as scoping targets, not measured
results, and the copy says so — worth keeping that way as the real numbers
arrive.
