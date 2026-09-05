#!/usr/bin/env node
// plan-anchors: a plan cites files as `path[:line]` · "phrase" — the phrase is what the reader
// greps, the line number is a hint that rots. /implement runs this before Task 1; /plan-work runs
// it before scoring confidence. Traces to: 2026-09-05 — two plans cited a reference by line
// range and both ranges had moved (analysis 4.4).
//   node .claude/tooling/plan-anchors.mjs <plan.md> [--root <dir>]
// Exit 0: every anchor resolves. Exit 1: a MISS, or a Read first: line with no parsable anchor.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = resolve(rootIdx !== -1 ? argv[rootIdx + 1] : process.cwd());
const planPath = argv.find((a, i) => !a.startsWith("--") && (rootIdx === -1 || i !== rootIdx + 1));
if (!planPath) { console.error("usage: plan-anchors.mjs <plan.md> [--root <dir>]"); process.exit(64); }

const text = readFileSync(resolve(planPath), "utf8").replace(/\r\n/g, "\n");
// Only the Context section carries anchors; task bodies quote code freely.
const ctxStart = text.indexOf("\n## Context");
const ctxEnd = ctxStart === -1 ? -1 : text.indexOf("\n## ", ctxStart + 1);
const context = ctxStart === -1 ? "" : text.slice(ctxStart, ctxEnd === -1 ? undefined : ctxEnd);
const ANCHOR = /`([^`\s]+?)(?::\d+(?:-\d+)?)?`\s*·\s*"([^"]+)"/g;

let ok = 0, miss = 0;
for (const m of context.matchAll(ANCHOR)) {
  const [, file, phrase] = m;
  const abs = resolve(root, file);
  if (!existsSync(abs)) { console.log(`MISS  ${file} — file not found`); miss++; continue; }
  const body = readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
  const at = body.indexOf(phrase);
  if (at === -1) { console.log(`MISS  ${file} "${phrase}"`); miss++; continue; }
  const line = body.slice(0, at).split("\n").length;
  console.log(`ok    ${file}:${line} "${phrase}"`); ok++;
}
const hasReadFirst = /^\s*-?\s*(Read first|Pattern to follow):/m.test(context);
if (hasReadFirst && ok + miss === 0) {
  console.log('no anchors found — Read first: entries need `path` · "phrase" (see .claude/references/plan-template.md)');
  process.exit(1);
}
console.log(`anchors: ${ok} ok, ${miss} missing`);
process.exit(miss ? 1 : 0);
