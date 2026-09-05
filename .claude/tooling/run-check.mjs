#!/usr/bin/env node
// run-check: run ONE gate command, keep its whole output on disk, print only what a verdict
// needs. /validate runs every gate command through this so a failing suite's thousands of
// lines never enter the context window (tool-call offloading). Exit code = the command's.
// Traces to: 2026-09-05 — /validate read full test output into the window with no cap.
// A wedged command is SIGKILLed after --timeout-sec (default 600) and reports exit 124.
//   node .claude/tooling/run-check.mjs <label> [--tail N] [--timeout-sec N] -- <command…>
import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep < 1) {
  console.error("usage: run-check.mjs <label> [--tail N] [--timeout-sec N] -- <command…>");
  process.exit(64);
}
const label = argv[0].replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "check";
const tailIdx = argv.indexOf("--tail");
const tailN = tailIdx !== -1 && tailIdx < sep ? Math.max(1, Number(argv[tailIdx + 1]) || 40) : 40;
const secIdx = argv.indexOf("--timeout-sec");
const timeoutSec = secIdx !== -1 && secIdx < sep ? Math.max(1, Number(argv[secIdx + 1]) || 600) : 600;
const cmd = argv.slice(sep + 1).join(" ");

const relDir = join(".claude", "state", "checks");
mkdirSync(join(process.cwd(), relDir), { recursive: true });
const rel = join(relDir, `${label}.log`);
const logPath = join(process.cwd(), rel);

// The child writes STRAIGHT to the log fd rather than through a buffer this process holds:
// the log fills while the command runs, so killing the runner from outside (a caller's own
// timeout) still leaves the partial output on disk. Shell execution is intentional: gate
// commands are repo-owner-authored, exactly like stop-gate.mjs's stopGate entries.
const fd = openSync(logPath, "w");
let res;
try {
  res = spawnSync(cmd, {
    shell: true,
    stdio: ["ignore", fd, fd],
    timeout: timeoutSec * 1000,
    killSignal: "SIGKILL",
  });
} finally {
  closeSync(fd);
}
// Only ETIMEDOUT is a timeout. A child that died from a signal with no such error (a crash,
// an OOM kill) is a signal death, not a deadline — saying "timed out" would misdiagnose it.
const timedOut = Boolean(res.error) && res.error.code === "ETIMEDOUT";
const code = timedOut ? 124 : res.status === null ? 1 : res.status;
const out = readFileSync(logPath, "utf8");
const lines = out.trimEnd() === "" ? [] : out.trimEnd().split("\n");
const note = timedOut
  ? ` · timed out after ${timeoutSec}s`
  : res.error
    ? ` · error=${res.error.code}`
    : res.status === null && res.signal
      ? ` · killed by ${res.signal}`
      : "";
console.log(`exit=${code} · log=${rel} · ${lines.length} lines${note}`);
if (lines.length) console.log(lines.slice(-tailN).join("\n"));
process.exit(code);
