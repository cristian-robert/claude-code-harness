#!/usr/bin/env node
// Stop hook: the deterministic "done" gate. Runs the fast checks configured in
// .claude/harness.json and blocks the turn from ending until they pass.
// - Honors stop_hook_active to avoid infinite re-block loops (Claude Code also
//   force-ends the turn after 8 consecutive blocks, so this can never wedge).
// - No gate configured => silent exit 0. The gate is meant to stay CHEAP
//   (lint + unit tests); the full gate is the explicit /validate skill.
// - Fails OPEN on internal errors: a broken gate script must not block work.
import { execSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MAX_REASON = 2_500;

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
  const verdict = failures.length ? "RED" : skipped.length ? "INCOMPLETE" : "GREEN";

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
  }
  process.exit(0);
}

main().catch(() => process.exit(0)); // fail open: a broken gate must not trap the session
