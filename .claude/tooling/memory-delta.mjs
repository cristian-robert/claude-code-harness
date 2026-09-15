#!/usr/bin/env node
// memory-delta: auto-memory `feedback` entries are corrections the team never got. /evolve diffs
// MEMORY.md against the copy taken at its previous run, promotes what generalizes, and deletes
// it from memory (00-core.md "Memory"). Traces to: 2026-09-05 — /evolve listed "user corrections"
// as a source and never read the file that records them (analysis 4.2).
//   node .claude/tooling/memory-delta.mjs snapshot|diff [--root <dir>]
// Memory file: $PHE_MEMORY_FILE, else <$CLAUDE_CONFIG_DIR or ~/.claude>/projects/<encoded>/memory/
// MEMORY.md, <encoded> = the git top-level path with / and \ turned into - . memory.md (raw,
// 2026-09-05) documents only "derived from the git repository": the encoding is OBSERVED, so a
// missing file is reported, never thrown.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const sub = argv[0];
const rootIdx = argv.indexOf("--root");
const rootArg = rootIdx === -1 ? null : argv[rootIdx + 1];
// Usage FIRST: a bare `--root` (or one swallowing the next flag) reached resolve(undefined) and
// threw a stack trace with exit 1 — the contract is exit 64, and no git call, before any work.
const badRoot = rootIdx !== -1 && (!rootArg || rootArg.startsWith("-"));
if (badRoot || (sub !== "snapshot" && sub !== "diff")) { console.error("usage: memory-delta.mjs snapshot|diff [--root <dir>]"); process.exit(64); }
let root = resolve(rootArg || process.cwd());
if (rootIdx === -1) { try { root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim() || root; } catch { /* not a git repo: cwd is the root */ } }

const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
const memory = process.env.PHE_MEMORY_FILE || join(configDir, "projects", root.replace(/[\\/]/g, "-"), "memory", "MEMORY.md");
const snapshot = join(root, ".claude", "state", "evolve-memory.md");

if (!existsSync(memory)) { console.log(`no auto-memory file at ${memory} — nothing to diff`); process.exit(0); }
if (sub === "snapshot") {
  mkdirSync(join(root, ".claude", "state"), { recursive: true });
  copyFileSync(memory, snapshot);
  console.log(`snapshot: ${snapshot}`);
  process.exit(0);
}
if (!existsSync(snapshot)) { console.log("no snapshot yet — run memory-delta.mjs snapshot at the end of this /evolve"); process.exit(0); }
const lines = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
const before = new Set(lines(snapshot));
const added = lines(memory).filter((l) => !before.has(l));
if (!added.length) { console.log("no new MEMORY.md lines since the last /evolve"); process.exit(0); }
for (const l of added) console.log(`+ ${l}`);
process.exit(0);
