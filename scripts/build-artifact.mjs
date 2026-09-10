/**
 * Builds dist/artifact.html from public/index.html.
 *
 * The Artifact host supplies its own <!doctype>, <html>, <head> and <body>,
 * so a published page must be the *contents* of the document, not the whole
 * document. This strips the shell and drops the favicon link (the Artifact
 * tool takes an emoji favicon instead), leaving the <title>, <style>, markup
 * and <script> exactly as they are in the deployable page — one source, two
 * targets, no drift.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(join(root, "public", "index.html"), "utf8");

const headMatch = source.match(/<head>([\s\S]*?)<\/head>/i);
const bodyMatch = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

if (!headMatch || !bodyMatch) {
  throw new Error("public/index.html is missing a <head> or <body> — cannot build the artifact.");
}

const head = headMatch[1]
  .replace(/[ \t]*<meta charset[^>]*>\n?/i, "")
  .replace(/[ \t]*<meta name="viewport"[^>]*>\n?/i, "")
  .replace(/[ \t]*<link rel="icon"[^>]*>\n?/i, "")
  .trim();

const out = `${head}\n${bodyMatch[1].trimEnd()}\n`;

await mkdir(join(root, "dist"), { recursive: true });
await writeFile(join(root, "dist", "artifact.html"), out);

console.log(`dist/artifact.html — ${out.length.toLocaleString()} bytes`);
