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
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

// This literal is the source of truth today. `.claude/hooks/guard.mjs` does NOT yet carry
// it — a later increment lands the same regex there as `KB_SECRET`, DUPLICATED rather than
// imported (hooks are copied standalone into adopter repos and must stay dependency-free
// and copy-safe). Once it lands: guard.mjs blocks the WRITE, this blocks the COMMIT, and a
// smoke-test assert must pin the two regex source strings byte-identical.
//
// Shape detection, not entropy. Every alternative below was probed against a real
// credential of that vendor's current format; the narrower predecessor caught only AKIA,
// PEM headers and bare `key: value`, and was blind to Anthropic, OpenAI, GitHub, Stripe,
// Slack, Google and JWT shapes.
const SECRET_SHAPE = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-(?:proj|ant|[a-z]{2,8})-[A-Za-z0-9_\-]{20,}|\bsk-[A-Za-z0-9]{20,}|\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bxox[abprs]-[A-Za-z0-9-]{20,}|\bAIza[A-Za-z0-9_\-]{35}\b|\bAKIA[0-9A-Z]{16}\b|\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}|(?:password|passwd|api[_-]?key|secret|token)[A-Za-z0-9_.\-]*\s*[:=]\s*["']?[A-Za-z0-9_\-+/]{12,})/i;

// Argv is parsed strictly. A gate that mis-parses its own invocation checks the wrong
// directory and says GREEN: a valueless `--scaffold` used to fall through to the default,
// and a stray second positional silently overwrote the first.
const USAGE = "usage: kb-check [kbDir] [--scaffold <dir>]";
let kbArg = null, scaffoldArg = null;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--scaffold") {
    scaffoldArg = argv[++i];
    if (scaffoldArg === undefined || scaffoldArg.slice(0, 2) === "--") {
      console.log(`kb-check: --scaffold requires a directory argument. ${USAGE}`);
      process.exit(1);
    }
  } else if (argv[i].slice(0, 2) === "--") {
    console.log(`kb-check: unknown flag ${argv[i]}. ${USAGE}`);
    process.exit(1);
  } else if (kbArg !== null) {
    console.log(`kb-check: unexpected second positional argument ${argv[i]} — ${USAGE}`);
    process.exit(1);
  } else {
    kbArg = argv[i];
  }
}
const kbDir = resolve(kbArg || "knowledge-base");
const scaffoldDir = resolve(scaffoldArg || join(".claude", "references", "knowledge-base-scaffold"));

if (!existsSync(kbDir)) {
  console.log(`kb-check: ${kbDir} does not exist — the project has no knowledge base yet.`);
  process.exit(1);
}

// Named plumbing only. The earlier rule — skip everything starting with "." — was written
// for .obsidian/ (operator-owned, gitignored) and generalised into a universal bypass of the
// secrets check: a credential in knowledge-base/.secrets.md passed GREEN. Dotfiles are still
// git-tracked and still published. Symlinks are followed for content because a symlinked
// note is as published as a copied one.
const PLUMBING = new Set([".obsidian", ".git", ".claude"]);

function subdirs(dir) {
  const out = [dir];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !PLUMBING.has(e.name)) out.push(...subdirs(join(dir, e.name)));
  }
  return out;
}

function allFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (PLUMBING.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...allFiles(p));
    else if (e.isFile()) out.push(p);
    // A symlink is followed only once it is CONFIRMED to resolve to a regular file. Handing
    // one straight to readFileSync crashes the whole run — ENOENT on a dangling link, EISDIR
    // on a link to a directory — and `findings` is not flushed until the end, so a KB holding
    // a real credential printed a stack trace and reported nothing. Fail-closed on the exit
    // code but fail-OPEN on the information is strictly worse than never following links.
    // A link that does not resolve to a file is REPORTED, not skipped: same rule as (b) NOT
    // RUN — an unscannable path is an unscanned subtree, not a clean one.
    else if (e.isSymbolicLink()) {
      let readable = false;
      try { readable = statSync(p).isFile(); } catch { readable = false; }
      if (readable) out.push(p);
      else findings.push(`(c) UNREADABLE symlink: ${relative(kbDir, p)}`);
    }
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
  // A check that could not RUN is not a check that PASSED. Skipping this one silently
  // turned an entirely unfilled knowledge base into a GREEN gate.
  findings.push(`(b) NOT RUN — no scaffold at ${scaffoldDir}. Placeholders are unchecked; pass --scaffold <dir>.`);
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
    // Escape hatch. resources.md exists to hold credential POINTERS ("password:
    // 1Password/Shared-Engineering"), which are shaped exactly like the thing being
    // hunted. Line-scoped and explicit: an author waives the check one line at a time,
    // and the waiver is visible in the diff.
    if (lines[i].indexOf("<!-- kb-check:allow -->") !== -1) continue;
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
