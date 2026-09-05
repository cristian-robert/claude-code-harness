#!/usr/bin/env node
// self-harness: this framework repo runs under its own payload. Sync copies
// template/.claude -> <root>/.claude through the SAME backupAndCopy the CLI uses
// (symlinks refused, settings.local.json and harness.json never copied); harness.json
// is merged so the root's stop gate survives; two skills are project content and are
// copied once, never re-synced. A file the template RETIRES is removed from the root too —
// root .claude/ is generated, so a deleted rule or skill must stop loading here. `--check`
// exits 1 on drift and is a root stop-gate command, so a template edit cannot end a turn
// until the root matches it.
// Traces to: 2026-09-05 — the repo ran with no guard, no gate, no pipeline skills.
//   node tools/self-harness.mjs [--check] [--root <dir>] [--template <dir>]
import { createRequire } from "node:module";
import { readFileSync, readdirSync, existsSync, mkdirSync, copyFileSync, unlinkSync, rmdirSync } from "node:fs";
import { join, relative, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { backupAndCopy, preserveBeforeOverwrite } = require("../cli/backup-copy.js");
const { installHarnessConfig } = require("../cli/harness-config.js");
const { writeHarnessTargets } = require("../cli/harness-targets.js");

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i !== -1 ? argv[i + 1] : null; };
const CHECK = argv.includes("--check");
const ROOT = resolve(flag("--root") || REPO);
const TEMPLATE = resolve(flag("--template") || join(REPO, "template", ".claude"));
const DEST = join(ROOT, ".claude");

// Project content by design — filled per project like AGENTS.md. Copied once, then owned by the root.
const ADAPTED = ["skills/architecture-map", "skills/debugging-this-repo"];
const NEVER = new Set(["harness.json", "settings.local.json"]);
// backupAndCopy's own safety net, not payload — never reported as drift, never swept.
const BACKUP = /\.backup(-|$)/;

function files(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink() || NEVER.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) files(p, base, out);
    else if (e.isFile()) out.push(relative(base, p).split(sep).join("/"));
  }
  return out;
}

function drift() {
  const out = [];
  for (const f of files(TEMPLATE)) {
    if (ADAPTED.some((a) => f.startsWith(a + "/"))) continue;
    const dest = join(DEST, f);
    if (!existsSync(dest)) out.push(`missing  ${f}`);
    else if (!readFileSync(join(TEMPLATE, f)).equals(readFileSync(dest))) out.push(`differs  ${f}`);
  }
  return out;
}

// Top-level directories the template owns. Extras are looked for ONLY under these, so
// agent-memory/, state/ and settings.local.json at the root are out of scope by construction.
function templateDirs() {
  return readdirSync(TEMPLATE, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.isSymbolicLink())
    .map((e) => e.name);
}

// Root files the template no longer ships. Root .claude/ is GENERATED: a rule or skill
// retired from the payload must stop loading here, or every future session keeps reading it.
function extras() {
  const shipped = new Set(files(TEMPLATE));
  const out = [];
  for (const d of templateDirs()) {
    const rootDir = join(DEST, d);
    if (!existsSync(rootDir)) continue;
    for (const f of files(rootDir, DEST)) {
      if (shipped.has(f) || BACKUP.test(f)) continue;
      // The root OWNS an adapted skill's content — but only while the template still ships it.
      if (ADAPTED.some((a) => f.startsWith(a + "/") && existsSync(join(TEMPLATE, a)))) continue;
      out.push(f);
    }
  }
  return out;
}

function removeExtras() {
  const list = extras();
  const dirs = new Set();
  for (const f of list) {
    const p = join(DEST, f);
    unlinkSync(p); // file by file on purpose — no recursive delete inside a generated tree
    // A .backup exists only to recover the file it shadows. Once that file is retired from
    // the payload AND the root, its backup is orphaned — and it would hold the directory open.
    const dir = dirname(p);
    const base = f.split("/").pop();
    for (const sib of readdirSync(dir)) {
      if (sib.startsWith(base + ".backup")) unlinkSync(join(dir, sib));
    }
    for (let d = dir; d !== DEST && d.startsWith(DEST); d = dirname(d)) dirs.add(d);
  }
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    if (existsSync(d) && readdirSync(d).length === 0) rmdirSync(d);
  }
  return list.length;
}

function sync() {
  const stats = { created: 0, updated: 0, backedUp: 0 };
  const add = (s) => { stats.created += s.created; stats.updated += s.updated; stats.backedUp += s.backedUp; };
  mkdirSync(DEST, { recursive: true });
  for (const e of readdirSync(TEMPLATE, { withFileTypes: true })) {
    if (e.isSymbolicLink() || NEVER.has(e.name)) continue;
    const src = join(TEMPLATE, e.name), dest = join(DEST, e.name);
    if (e.isDirectory() && e.name === "skills") {
      for (const s of readdirSync(src, { withFileTypes: true })) {
        if (!s.isDirectory()) continue;
        const adapted = ADAPTED.includes(`skills/${s.name}`);
        if (adapted && existsSync(join(dest, s.name, "SKILL.md"))) continue;
        add(backupAndCopy(join(src, s.name), join(dest, s.name), ROOT));
      }
    } else if (e.isDirectory()) {
      add(backupAndCopy(src, dest, ROOT));
    } else if (e.isFile()) {
      if (existsSync(dest)) {
        if (preserveBeforeOverwrite(dest, src, relative(ROOT, dest)).backedUp) stats.backedUp++;
        stats.updated++;
      } else stats.created++;
      copyFileSync(src, dest);
    }
  }
  const removed = removeExtras();
  const delta = installHarnessConfig(ROOT, join(TEMPLATE, "harness.json"));
  for (const n of delta.notices) console.log(n);
  writeHarnessTargets(ROOT, ["claude"]);
  console.log(`self-harness: synced ${TEMPLATE} -> ${DEST} · created ${stats.created} · updated ${stats.updated} · backed up ${stats.backedUp} · removed ${removed}`);
}

if (CHECK) {
  const d = drift().concat(extras().map((f) => `extra    ${f}`));
  if (d.length) {
    console.error(`self-harness: root .claude/ drifts from the template (${d.length}):\n  ${d.join("\n  ")}\nRun: node tools/self-harness.mjs`);
    process.exit(1);
  }
  console.log("self-harness: root .claude/ matches template/.claude/");
} else {
  sync();
}
