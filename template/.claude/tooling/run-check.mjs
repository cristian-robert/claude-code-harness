#!/usr/bin/env node
// run-check: run ONE gate command, keep its whole output on disk, print only what a verdict
// needs. /validate runs every gate command through this so a failing suite's thousands of
// lines never enter the context window (tool-call offloading). Exit code = the command's.
// Traces to: 2026-09-05 — /validate read full test output into the window with no cap.
// A wedged command is SIGKILLed after --timeout-sec (default 600) and reports exit 124.
//   node .claude/tooling/run-check.mjs <label> [--tail N] [--timeout-sec N] -- <command…>
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
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

// Shell execution is intentional: gate commands are repo-owner-authored (same trust as
// package.json scripts), exactly like stop-gate.mjs's stopGate entries.
const res = spawnSync(cmd, {
  shell: true,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  timeout: timeoutSec * 1000,
  killSignal: "SIGKILL",
});
// A maxBuffer overrun ALSO kills the child (signal set), so an error object decides first:
// only ETIMEDOUT is a timeout; every other error is named in the header instead.
const timedOut = res.error ? res.error.code === "ETIMEDOUT" : Boolean(res.signal);
const code = timedOut ? 124 : res.status === null ? 1 : res.status;
const out = `${res.stdout || ""}${res.stderr || ""}`;
writeFileSync(join(process.cwd(), rel), out);
const lines = out.trimEnd() === "" ? [] : out.trimEnd().split("\n");
const note = timedOut ? ` · timed out after ${timeoutSec}s` : res.error ? ` · error=${res.error.code}` : "";
console.log(`exit=${code} · log=${rel} · ${lines.length} lines${note}`);
if (lines.length) console.log(lines.slice(-tailN).join("\n"));
process.exit(code);
