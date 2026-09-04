#!/usr/bin/env node
// self-harness: this framework repo runs under its own payload. Sync copies
// template/.claude -> <root>/.claude through the SAME backupAndCopy the CLI uses
// (symlinks refused, settings.local.json and harness.json never copied); harness.json
// is merged so the root's stop gate survives; two skills are project content and are
// copied once, never re-synced. `--check` exits 1 on drift and is a root stop-gate
// command, so a template edit cannot end a turn until the root matches it.
// Traces to: 2026-09-05 — the repo ran with no guard, no gate, no pipeline skills.
//   node tools/self-harness.mjs [--check] [--root <dir>] [--template <dir>]
import { createRequire } from "node:module";
import { readFileSync, readdirSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
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

function files(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink() || NEVER.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) files(p, base, out);
    else if (e.isFile()) out.push(relative(base, p));
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
  const delta = installHarnessConfig(ROOT, join(TEMPLATE, "harness.json"));
  for (const n of delta.notices) console.log(n);
  writeHarnessTargets(ROOT, ["claude"]);
  console.log(`self-harness: synced ${TEMPLATE} -> ${DEST} · created ${stats.created} · updated ${stats.updated} · backed up ${stats.backedUp}`);
}

if (CHECK) {
  const d = drift();
  if (d.length) {
    console.error(`self-harness: root .claude/ drifts from the template (${d.length}):\n  ${d.join("\n  ")}\nRun: node tools/self-harness.mjs`);
    process.exit(1);
  }
  console.log("self-harness: root .claude/ matches template/.claude/");
} else {
  sync();
}
