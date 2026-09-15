#!/usr/bin/env node
// plan-anchors: a plan cites files as `path[:line]` · "phrase" — the phrase is what the reader
// greps, the line number is a hint that rots. /implement runs this before Task 1; /plan-work runs
// it before scoring confidence. Traces to: 2026-09-05 — two plans cited a reference by line
// range and both ranges had moved (analysis 4.4).
//   node .claude/tooling/plan-anchors.mjs <plan.md> [--root <dir>]
// Exit 0 only when every anchor resolves AND every citation line parses. A checker that stays
// silent about what it could not read is worse than none, so exit 1 covers: a MISS, an UNPARSED
// citation, a `## Context` that yields no anchors, and a plan with no `## Context` heading at all
// (review 2026-09-05 — one good anchor used to excuse every malformed sibling, a `### Context`
// plan checked nothing at exit 0, and a Context citing nothing reported a vacuous pass).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const rootArg = rootIdx === -1 ? null : argv[rootIdx + 1];
const planPath = argv.find((a, i) => !a.startsWith("--") && (rootIdx === -1 || i !== rootIdx + 1));
// Usage FIRST: a bare `--root` (or one swallowing the next flag) reached resolve(undefined) and
// threw a stack trace with exit 1 — the contract is exit 64, before any read (memory-delta.mjs
// took the same fix; review 2026-09-05 — two sibling tools disagreed on one malformed flag).
const badRoot = rootIdx !== -1 && (!rootArg || rootArg.startsWith("-"));
if (badRoot || !planPath) { console.error("usage: plan-anchors.mjs <plan.md> [--root <dir>]"); process.exit(64); }
const root = resolve(rootArg || process.cwd());

const lines = readFileSync(resolve(planPath), "utf8").replace(/\r\n/g, "\n").split("\n");
// Only the Context section carries anchors; task bodies quote code freely.
const ctxStart = lines.findIndex((l) => /^## Context\b/.test(l));
if (ctxStart === -1) {
  console.log("no ## Context section — plan-anchors.mjs checks Read first: / Pattern to follow: entries under that heading");
  process.exit(1);
}
let ctxEnd = lines.length;
for (let i = ctxStart + 1; i < lines.length; i++) if (/^## /.test(lines[i])) { ctxEnd = i; break; }
const ctx = lines.slice(ctxStart, ctxEnd);

const ANCHOR = /`([^`\s]+?)(?::\d+(?:-\d+)?)?`\s*·\s*"([^"]+)"/g;
const PATHISH = /`[^`\s]*[/.][^`\s]*`/;             // a backticked token with a slash or a dot
const CITATION = /^[ \t]*[-*]\s+(Read first|Pattern to follow)/;
const indent = (l) => (l.trim() === "" ? 0 : l.match(/^[ \t]*/)[0].length);

let ok = 0, miss = 0, unparsed = 0;
for (const m of ctx.join("\n").matchAll(ANCHOR)) {
  const [, file, phrase] = m;
  const abs = resolve(root, file);
  if (!existsSync(abs)) { console.log(`MISS  ${file} — file not found`); miss++; continue; }
  const body = readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
  const at = body.indexOf(phrase);
  if (at === -1) { console.log(`MISS  ${file} "${phrase}"`); miss++; continue; }
  const line = body.slice(0, at).split("\n").length;
  console.log(`ok    ${file}:${line} "${phrase}"`); ok++;
}

// A citation bullet and its deeper-indented continuations are the lines that MUST parse: one good
// anchor never excuses a malformed sibling. Lines outside a citation group (Knowledge to load
// first:, Platform contract, Measured) cite freely and are not examined.
for (let i = 0; i < ctx.length; i++) {
  if (!CITATION.test(ctx[i])) continue;
  const base = indent(ctx[i]);
  let end = i + 1;
  while (end < ctx.length && indent(ctx[end]) > base) end++;
  for (let j = i; j < end; j++) {
    if (!PATHISH.test(ctx[j]) || [...ctx[j].matchAll(ANCHOR)].length) continue;
    console.log(`UNPARSED  ${ctxStart + j + 1}: ${ctx[j].trim().slice(0, 100)}`);
    unparsed++;
  }
  i = end - 1;
}

// Zero anchors is never a pass: a `## Context` with no citation at all is a plan that cites
// nothing, and the guard used to excuse it whenever no bullet said `Read first`.
if (ok + miss === 0) {
  console.log('no anchors found — Read first: entries need `path` · "phrase" (see .claude/references/plan-template.md)');
  process.exit(1);
}
console.log(`anchors: ${ok} ok, ${miss} missing, ${unparsed} unparsed`);
process.exit(miss || unparsed ? 1 : 0);
