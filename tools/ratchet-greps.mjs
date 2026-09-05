#!/usr/bin/env node
// ratchet-greps: one repo-wide sweep for vocabulary this repo has RETIRED. A rename or a
// retirement leaks into every enumeration — prose, comments, fixtures, docs — and an enumerated
// file list in the brief is stale the round after it is written. So the check is a grep over the
// whole scope, ratcheted into the gate, not a list of files somebody remembered.
//
// Why a repo tool and not a fenced block in /validate's ratcheted-grep section: this repo's
// .claude/ is a GENERATED copy of template/.claude/ and must match it byte-for-byte, so a
// repo-specific grep cannot live in the synced skill. A repo with a synced .claude/ hosts its
// greps here and the gate names the tool.
//
// Traces to: 2026-09-05 — three fix rounds chasing stale three-role lists, a docs/99 "defeats
//   sibling review" line, and README/guard comments still saying "opt-in" after
//   requireEvolveBeforePush flipped to default on.
//
//   node tools/ratchet-greps.mjs [--root <dir>]
//
// A line that deliberately NAMES a retired term (a retirement note, an assertion about the old
// shape) carries the marker `ratchet-ok` and is skipped. Retiring more vocabulary means adding a
// CHECKS entry with its own `traces to:` — never widening an existing one.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const rootFlag = argv.indexOf("--root");
const ROOT = resolve(rootFlag !== -1 ? argv[rootFlag + 1] : REPO);

// Scope: the payload, the discipline docs, the CLI, the tools, the front page.
const SCOPE = ["template", "docs", "cli", "tools", "README.md"];
const SKIP_DIRS = new Set(["node_modules", ".git"]);
// This file and its test quote every retired term by definition.
const SELF = new Set(["tools/ratchet-greps.mjs", "cli/ratchet-greps.test.js"]);
const MARKER = "ratchet-ok";

const CHECKS = [
  {
    name: 'retired harness.json key "autonomous"',
    hit: (l) => /"autonomous"\s*:/.test(l),
  },
  {
    name: "retired sibling-model review inversion",
    hit: (l) => /sibling[- ](review|model|tier)/i.test(l),
  },
  {
    // The three-role list scout/build/deep, retired when `routine` was added. Matches an
    // ENUMERATION (names separated by up to 3 non-alphanumerics), so a JS map whose values sit
    // between the keys is not a hit; a line that also names `routine` is current, not stale.
    name: "retired three-role list (scout/build/deep — `routine` is missing)",
    hit: (l) => /scout[^A-Za-z0-9]{1,3}build[^A-Za-z0-9]{1,3}deep/i.test(l) && !/routine/i.test(l),
  },
  {
    name: 'evolve->push gate described as "opt-in" (it is default on)',
    hit: (l) => /opt-?in\b[^\n]{0,40}evolve|evolve[^\n]{0,40}\bopt-?in\b/i.test(l),
  },
];

function walk(abs, out) {
  let st;
  try { st = statSync(abs); } catch { return; }
  if (st.isDirectory()) {
    for (const name of readdirSync(abs).sort()) {
      if (SKIP_DIRS.has(name)) continue;
      walk(join(abs, name), out);
    }
  } else if (st.isFile()) {
    out.push(abs);
  }
}

const files = [];
for (const entry of SCOPE) walk(join(ROOT, entry), files);

const hits = [];
for (const abs of files) {
  const rel = relative(ROOT, abs).split(sep).join("/");
  if (SELF.has(rel)) continue;
  let text;
  try { text = readFileSync(abs, "utf8"); } catch { continue; }
  if (text.includes("\0")) continue; // binary
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(MARKER)) continue;
    for (const check of CHECKS) {
      if (check.hit(line)) hits.push({ rel, line: i + 1, check: check.name, text: line.trim().slice(0, 120) });
    }
  }
}

if (hits.length === 0) {
  console.log("clean");
  process.exit(0);
}
console.error(`ratchet-greps: ${hits.length} retired-vocabulary hit(s) in ${SCOPE.join(" ")}`);
for (const h of hits) console.error(`  ${h.rel}:${h.line}  [${h.check}]\n    ${h.text}`);
console.error(`\nFix the text, or mark a deliberate mention with \`${MARKER}\` on that line.`);
process.exit(1);
