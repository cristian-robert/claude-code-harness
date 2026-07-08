#!/usr/bin/env node
// PreCompact: snapshot working state to .claude/state/compact-snapshot.md so
// session-start.mjs (source: "compact") can re-inject what compaction may lose.
// Side-effect only — NEVER blocks compaction (a failed snapshot must not strand
// a full window), never writes JSON stdout. Exit 0 always; fail open.
// Note: .claude/state/ is session scratch — adopters add it to .gitignore.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function git(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return null; }
}

function newest(dir, suffix) {
  try {
    const c = readdirSync(dir).filter(f => f.endsWith(suffix))
      .map(f => ({ f, m: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.m - a.m);
    return c.length ? c[0].f : null;
  } catch { return null; }
}

async function main() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const event = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const cwd = event.cwd || process.cwd();
  const lines = [`# Compact snapshot`, `- when: ${new Date().toISOString()}`, `- trigger: ${event.trigger || "unknown"}`];

  const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch) lines.push(`- branch: ${branch}`);
  const status = (git(cwd, ["status", "--porcelain"]) || "").split("\n").filter(Boolean);
  if (status.length) {
    lines.push(`- uncommitted (${status.length}):`);
    for (const s of status.slice(0, 30)) lines.push(`  - ${s.trim()}`);
    if (status.length > 30) lines.push(`  - …and ${status.length - 30} more`);
  }
  const last = git(cwd, ["log", "-1", "--format=%h %s"]);
  if (last) lines.push(`- last commit: ${last}`);

  const plan = newest(join(cwd, "plans"), ".md");
  if (plan) lines.push(`- active plan: plans/${plan}`);
  const report = newest(join(cwd, "reports"), ".md");
  if (report) lines.push(`- latest report: reports/${report}`);

  const gatePath = join(cwd, ".claude", "state", "last-gate.json");
  if (existsSync(gatePath)) {
    try {
      const g = JSON.parse(readFileSync(gatePath, "utf8"));
      lines.push(`- last stop-gate: ${g.verdict || "unknown"} (${g.when || "?"})`);
    } catch { /* unreadable gate state: skip the line */ }
  }

  const stateDir = join(cwd, ".claude", "state");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "compact-snapshot.md"), lines.join("\n") + "\n");
  process.exit(0);
}

main().catch(() => process.exit(0)); // fail open: never block compaction
