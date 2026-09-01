#!/usr/bin/env node
// Stop hook: the deterministic "done" gate. Runs the fast checks configured in
// .claude/harness.json and blocks the turn from ending until they pass.
// - Honors stop_hook_active to avoid infinite re-block loops (Claude Code also
//   force-ends the turn after 8 consecutive blocks, so this can never wedge).
// - No gate configured => silent exit 0. The gate is meant to stay CHEAP
//   (lint + unit tests); the full gate is the explicit /validate skill.
// - Fails OPEN on internal errors: a broken gate script must not block work.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const MAX_REASON = 2_500;

// sha1 of every COMMITTED file matching the stopGateTamperPaths entries
// (prefix "dir/", suffix "*.ext", or exact path — not full globs: zero-dep
// Node 18). Committed-only via `git ls-files` (plumbing, ADR-021) so a brand-new
// test file is added coverage, never punished. null = not a git repo / git
// missing → the tamper layer silently stands down.
function hashGated(cwd, patterns) {
  try {
    const out = execSync("git ls-files -z", { cwd, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
    const match = (f) => patterns.some((p) => p.endsWith("/") ? f.startsWith(p) : p.startsWith("*.") ? f.endsWith(p.slice(1)) : f === p);
    const snap = {};
    for (const f of out.split("\0").filter(Boolean)) {
      if (!match(f)) continue;
      try { snap[f] = createHash("sha1").update(readFileSync(join(cwd, f))).digest("hex"); } catch { /* deleted since ls-files: skip */ }
    }
    return snap;
  } catch { return null; /* no git: feature off */ }
}

async function main() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const event = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (event.stop_hook_active) process.exit(0);

  const cwd = event.cwd || process.cwd();
  const cfgPath = join(cwd, ".claude", "harness.json");
  if (!existsSync(cfgPath)) process.exit(0);

  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  const gate = Array.isArray(cfg.stopGate) ? cfg.stopGate : [];
  if (gate.length === 0) process.exit(0);
  // Per-command cap AND a cumulative budget: the gate fires on EVERY turn end,
  // so it must stay in seconds — and must finish before the hook's own outer
  // timeout (settings.json) would cut it off mid-command.
  const perCmd = (cfg.stopGateTimeoutSec || 30) * 1000;
  const totalBudget = (cfg.stopGateTotalSec || 75) * 1000;
  const started = Date.now();

  const failures = [];
  const failedCmds = [];
  const skipped = [];
  for (const cmd of gate) {
    const remaining = totalBudget - (Date.now() - started);
    // Budget spent: DON'T silently pass the rest. An unrun check is not a green
    // check — record it as skipped and block the turn as INCOMPLETE below.
    if (remaining < 1000) { skipped.push(cmd); continue; }
    // Shell execution is intentional: stopGate entries are repo-owner-authored
    // commands (same trust level as package.json scripts), not untrusted input.
    try {
      execSync(cmd, { cwd, encoding: "utf8", timeout: Math.min(perCmd, remaining), stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      const out = `${err.stdout || ""}\n${err.stderr || ""}`.trim();
      failures.push(`$ ${cmd}\n${out.slice(-800) || "(no output, non-zero exit)"}`);
      failedCmds.push(cmd);
    }
  }

  // Verdict: RED if anything failed, INCOMPLETE if the budget skipped a check
  // before it could run (a partial gate is NOT a pass), else GREEN.
  let verdict = failures.length ? "RED" : skipped.length ? "INCOMPLETE" : "GREEN";

  // Tamper check (opt-in via harness.json stopGateTamperPaths): on RED, snapshot
  // the gated files ONCE — re-snapshotting per block would let them be edited one
  // turn at a time. On GREEN with a snapshot present, a changed gated file means
  // the suite went green BECAUSE the check changed, not because the code was
  // fixed — refuse it. Traces to a documented upstream escape (coleam00/skills):
  // handed a failing `2+2==5` test, the agent rewrote the test and finished.
  // Best-effort like all state here: any error behaves as feature-off.
  let tampered = [];
  try {
    const paths = Array.isArray(cfg.stopGateTamperPaths)
      ? cfg.stopGateTamperPaths.filter((p) => typeof p === "string" && p) : [];
    if (paths.length) {
      const sid = String(event.session_id || "nosession").slice(0, 8);
      const snapPath = join(cwd, ".claude", "state", `tamper-${sid}.json`);
      if (verdict === "RED" && !existsSync(snapPath)) {
        const snap = hashGated(cwd, paths);
        if (snap && Object.keys(snap).length) {
          mkdirSync(join(cwd, ".claude", "state"), { recursive: true });
          writeFileSync(snapPath, JSON.stringify(snap));
        }
      } else if (verdict === "GREEN" && existsSync(snapPath)) {
        const before = JSON.parse(readFileSync(snapPath, "utf8"));
        // A DELETED or renamed gated file is a changed gated file — `rm` is the
        // cheapest way to make a suite "go green" (review round 1). But only
        // inside a non-null `now`: hashGated returns null on git failure, and
        // treating that as "everything missing" would fail CLOSED on a broken
        // git — the tamper layer stands down instead (snapshot kept).
        const now = hashGated(cwd, paths);
        if (now) {
          tampered = Object.keys(before).filter((f) => !(f in now) || now[f] !== before[f]).sort();
          if (tampered.length) verdict = "TAMPER"; // snapshot kept for the next attempt
          else unlinkSync(snapPath); // honest green: stand down
        }
      }
    }
  } catch { /* tamper layer is advisory scaffolding around the gate — never break the gate */ }

  // Persist the verdict for the PreCompact snapshot / statusline (.claude/state/
  // is gitignored by adopters). Best-effort: this write must never break the gate.
  try {
    const stateDir = join(cwd, ".claude", "state");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, "last-gate.json"), JSON.stringify({
      verdict, failed: failedCmds, skipped, when: new Date().toISOString(),
    }));
  } catch { /* state is advisory — swallow */ }

  if (verdict === "RED") {
    process.stdout.write(JSON.stringify({
      decision: "block",
      reason: `Stop gate failed (${failures.length}/${gate.length} commands red). Fix these before finishing:\n\n${failures.join("\n\n")}`.slice(0, MAX_REASON),
    }));
  } else if (verdict === "INCOMPLETE") {
    process.stdout.write(JSON.stringify({
      decision: "block",
      reason: `Stop gate INCOMPLETE — ${skipped.length}/${gate.length} check(s) never ran (time budget ${cfg.stopGateTotalSec || 75}s exhausted): ${skipped.join(", ")}. A partial gate is not a pass. Raise stopGateTotalSec, trim/speed up the gate, or run /validate manually before finishing.`.slice(0, MAX_REASON),
    }));
  } else if (verdict === "TAMPER") {
    process.stdout.write(JSON.stringify({
      decision: "block",
      reason: `Stop gate went GREEN only after edits to gated files: ${tampered.join(", ")}. If the check change is legitimate, explain it to the user and get their confirmation; otherwise revert it and fix the code instead. (harness.json stopGateTamperPaths)`.slice(0, MAX_REASON),
    }));
  }
  process.exit(0);
}

main().catch(() => process.exit(0)); // fail open: a broken gate must not trap the session
