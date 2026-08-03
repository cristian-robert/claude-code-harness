#!/usr/bin/env node
// kb-check: the three MECHANICAL checks on a project-local knowledge base.
//   node tools/kb-check.mjs [kbDir] [--scaffold <dir>]
// Defaults: kbDir = ./knowledge-base, scaffold = ./.claude/references/knowledge-base-scaffold
//
// Only three things about a KB are decidable without reading it for meaning, and those are
// the only three claimed here:
//   (a) every folder under the KB has an _index.md            (the Index Law)
//   (b) no KB file is byte-identical to its shipped scaffold placeholder
//   (c) no secret-shaped string appears anywhere in the KB
// "The _index.md is ACCURATE" is semantic and is deliberately NOT claimed.
// Exit 0 = green, 1 = red. Findings print one per line.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";

// Duplicated (not imported) from .claude/hooks/guard.mjs on purpose: hooks are copied
// standalone into adopter repos and must stay dependency-free and copy-safe. Keep the two
// in sync — guard.mjs blocks the WRITE, this blocks the COMMIT.
const SECRET_SHAPE = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-[A-Za-z0-9]{20,}|\bghp_[A-Za-z0-9]{20,}|\bAKIA[0-9A-Z]{16}\b|(?:password|passwd|api[_-]?key|secret|token)\s*[:=]\s*["']?[A-Za-z0-9_\-+/]{12,})/i;

let kbArg = null, scaffoldArg = null;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--scaffold") scaffoldArg = argv[++i];
  else kbArg = argv[i];
}
const kbDir = resolve(kbArg || "knowledge-base");
const scaffoldDir = resolve(scaffoldArg || join(".claude", "references", "knowledge-base-scaffold"));

if (!existsSync(kbDir)) {
  console.log(`kb-check: ${kbDir} does not exist — the project has no knowledge base yet.`);
  process.exit(1);
}

// .obsidian/ belongs to the operator and is gitignored; dotfiles are never KB content.
function subdirs(dir) {
  const out = [dir];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith(".")) out.push(...subdirs(join(dir, e.name)));
  }
  return out;
}

function allFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...allFiles(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

const findings = [];

// (a) Index Law
for (const d of subdirs(kbDir)) {
  if (!existsSync(join(d, "_index.md"))) {
    findings.push(`(a) no _index.md in ${relative(kbDir, d) || "."}/`);
  }
}

const files = allFiles(kbDir);

// (b) untouched scaffold placeholders
if (kbDir === scaffoldDir) {
  console.log("kb-check: (b) skipped — the checked dir IS the shipped scaffold.");
} else if (!existsSync(scaffoldDir)) {
  console.log(`kb-check: (b) skipped — no scaffold at ${scaffoldDir}.`);
} else {
  for (const f of files) {
    const twin = join(scaffoldDir, relative(kbDir, f));
    if (!existsSync(twin)) continue;
    if (readFileSync(f).equals(readFileSync(twin))) {
      findings.push(`(b) still the shipped placeholder: ${relative(kbDir, f)}`);
    }
  }
}

// (c) secret shapes
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (SECRET_SHAPE.test(lines[i])) {
      findings.push(`(c) secret-shaped string: ${relative(kbDir, f)}:${i + 1}`);
    }
  }
}

for (const f of findings) console.log(f);
console.log(findings.length
  ? `\nkb-check: RED — ${findings.length} finding(s) in ${kbDir}`
  : `kb-check: GREEN — ${files.length} file(s) in ${kbDir}`);
process.exit(findings.length ? 1 : 0);
