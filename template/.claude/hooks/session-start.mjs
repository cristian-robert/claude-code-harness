#!/usr/bin/env node
// SessionStart: injects a compact orientation block (git state, latest plan,
// gate status) so every fresh session starts oriented without re-exploring.
// Branches on event.source: startup/clear = orientation; resume = orientation
// + re-verify nudge; compact = re-inject the PreCompact snapshot (if fresh)
// + a warning about what compaction dropped. Keep the output SHORT (≤20 lines)
// — this lands in every session's context. Exit 0 always.
import { execFileSync } from "node:child_process";
import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SNAP_MAX_AGE_MS = 15 * 60 * 1000;
const SNAP_MAX_LINES = 17;

function git(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return null; }
}

function emit(lines) {
  if (lines.length) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join("\n") },
    }));
  }
  process.exit(0);
}

async function main() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const event = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const cwd = event.cwd || process.cwd();
  const source = event.source || "startup";
  const lines = [];

  if (source === "compact") {
    // Snapshot written by pre-compact.mjs (.claude/state/ — gitignored by adopters).
    const snap = join(cwd, ".claude", "state", "compact-snapshot.md");
    try {
      if (existsSync(snap) && Date.now() - statSync(snap).mtimeMs < SNAP_MAX_AGE_MS) {
        const snapLines = readFileSync(snap, "utf8").trim().split("\n");
        lines.push(...snapLines.slice(0, SNAP_MAX_LINES));
        if (snapLines.length > SNAP_MAX_LINES) lines.push(`…(${snapLines.length - SNAP_MAX_LINES} more lines in .claude/state/compact-snapshot.md)`);
      }
    } catch { /* stale/unreadable snapshot: the warning below still lands */ }
    lines.push("Compaction dropped: paths-scoped rules and subdirectory CLAUDE.md (reload on next matching file read). Disk artifacts (plans/, reports/) are ground truth over the summary.");
    emit(lines);
  }

  const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch) {
    const dirty = (git(cwd, ["status", "--porcelain"]) || "").split("\n").filter(Boolean).length;
    lines.push(`Branch: ${branch}${dirty ? ` · ${dirty} uncommitted file(s)` : " · clean"}`);
    const last = git(cwd, ["log", "-1", "--format=%h %s"]);
    if (last) lines.push(`Last commit: ${last}`);
  }

  const plansDir = join(cwd, "plans");
  if (existsSync(plansDir)) {
    const plans = readdirSync(plansDir).filter(f => f.endsWith(".md"))
      .map(f => ({ f, m: statSync(join(plansDir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    if (plans.length) lines.push(`Latest plan: plans/${plans[0].f} (resume with /implement plans/${plans[0].f})`);
  }

  const cfgPath = join(cwd, ".claude", "harness.json");
  if (existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
      const n = Array.isArray(cfg.stopGate) ? cfg.stopGate.length : 0;
      lines.push(n ? `Stop gate: ${n} check(s) armed — the turn cannot end red.` : "Stop gate: not configured (set stopGate in .claude/harness.json).");
      // A model map nobody has re-checked in a month is how a retired ID gets dispatched.
      // Duplicated (not imported) from cli/model-tiers.js on purpose: hooks are ESM and must
      // stay dependency-free and copy-safe into any adopter repo. Keep the two in sync.
      const m = cfg.models;
      if (m && typeof m === "object") {
        const days = typeof m.staleDays === "number" ? m.staleDays : 30;
        const t = Date.parse(m.checkedAt ?? "");
        const age = Date.now() - t;
        // age < 0 (a future checkedAt — typo, clock skew, hand-edit) is STALE, not fresh.
        // Freshness we cannot establish is exactly the freshness we must not assume: a
        // naive `age > limit` returns false for a future date and silently says "fresh".
        if (isNaN(t) || age < 0 || age > days * 864e5) {
          lines.push(`Model map is stale (checkedAt: ${m.checkedAt ?? "never"}) — run /models to re-verify against the live catalogs.`);
        }
      }
      // Files-backed board summary (backend none/github or missing dir: skip silently).
      try {
        const backend = cfg.workTracking?.backend;
        if (backend === "files" || backend === "github") { // files are canonical in BOTH; no gh call in a hook
          // Items live in the tracking root (primary checkout) — resolve it so a
          // worktree session still sees the global board. Fallback: cwd.

          let trackRoot = cwd;
          try { // first line of `git worktree list --porcelain` = the primary checkout
            const wt = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
            const m = wt.match(/^worktree (.+)$/m);
            if (m) trackRoot = m[1];
          } catch { /* not a git repo: cwd is the tracking root */ }
          const bl = join(trackRoot, "backlog");
          const counts = { ready: 0, doing: 0, review: 0 };
          for (const f of readdirSync(bl).filter(x => x.endsWith(".md")).slice(0, 200)) {
            const m = /^status:\s*(\S+)/m.exec(readFileSync(join(bl, f), "utf8").slice(0, 600));
            if (m && m[1] in counts) counts[m[1]]++;
          }
          const wip = cfg.workTracking?.wipLimit;
          const over = cfg.workTracking?.method !== "scrum" && typeof wip === "number" && counts.doing >= wip;
          lines.push(`Board: ${counts.ready} ready · ${counts.doing} doing · ${counts.review} review${over ? ` · WIP ${counts.doing}/${wip} — finish before starting` : ""}`);
        }
      } catch { /* no backlog/ or unreadable item: never slow or break startup */ }
    } catch { /* unreadable config: say nothing */ }
  }

  try { // uninitialized template? one nudge to the setup entry point
    const cm = readFileSync(join(cwd, "CLAUDE.md"), "utf8");
    if (cm.includes("<placeholder") || cm.includes("<Project Name>")) lines.push("Template not initialized — run /harness-init first.");
  } catch { /* no CLAUDE.md: nothing to say */ }

  if (source === "resume") lines.push("Session resumed — re-verify assumptions against git status before continuing.");

  emit(lines);
}

main().catch(() => process.exit(0));
