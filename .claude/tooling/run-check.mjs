#!/usr/bin/env node
// run-check: run ONE gate command, keep its whole output on disk, print only what a verdict
// needs. /validate runs every gate command through this so a failing suite's thousands of
// lines never enter the context window (tool-call offloading). Exit code = the command's.
// Traces to: 2026-09-05 — /validate read full test output into the window with no cap.
// A wedged command is SIGKILLed after --timeout-sec (default 600) and reports exit 124.
//   node .claude/tooling/run-check.mjs <label> [--tail N] [--timeout-sec N] -- <command…>
// Before `--` only the label and those two flags are accepted; any other word is a usage error.
// ONE word after `--` is a shell string (`-- "npm test && x"`); two or more words are re-quoted
// one by one so an argument with a space survives (`-- npm test -t "my test"`). Logs live at
// <git root>/.claude/state/checks/<label>.log; the newest 20 are kept.
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, fstatSync, mkdirSync, openSync, readSync, readdirSync, realpathSync, statSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";

const KEEP_LOGS = 20;      // a label that stops being used must not linger forever
const TAIL_BYTES = 65536;  // only the end of the log is read to print the tail

const usage = () => { console.error("usage: run-check.mjs <label> [--tail N] [--timeout-sec N] -- <command…>"); process.exit(64); };
const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep < 1 || argv[0].startsWith("-")) usage(); // a flag where the label should be is a usage error, never a label
const label = argv[0].replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "check";
const consumed = new Set([0]); // argv[0] is the label
const num = (flag, dflt) => { // fail closed: "abc", 0 or -3 is a usage error, never a silent default
  const i = argv.indexOf(flag);
  if (i === -1 || i >= sep) return dflt;
  const raw = String(argv[i + 1] ?? "").trim();
  const n = Number.parseInt(raw, 10);
  if (!/^\d+$/.test(raw) || n < 1) usage();
  consumed.add(i).add(i + 1);
  return n;
};
const tailN = num("--tail", 40);
const timeoutSec = num("--timeout-sec", 600);
// A word before `--` that no flag consumed — a typo like `--tial 5`, a repeat, a stray
// positional — is a usage error too: a misread option must never become a silent default.
for (let i = 1; i < sep; i++) if (!consumed.has(i)) usage();
const words = argv.slice(sep + 1);
if (!words.length) usage();
const q = (w) => (/^[A-Za-z0-9_./=:@%+,-]+$/.test(w) ? w : `'${w.replace(/'/g, "'\\''")}'`);
const cmd = words.length === 1 ? words[0] : words.map(q).join(" ");

// State lives at the repo root: a run from a subdirectory must not grow a second
// .claude/state/ that the root .gitignore never sees. Both paths are real paths — git reports
// the real path, and macOS temp dirs are symlinks — so the relative log path stays short.
const cwd = realpathSync(process.cwd());
let root = cwd;
try { root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim() || root; } catch { /* not a git repo: the cwd is the root */ }
const dir = join(root, ".claude", "state", "checks");
mkdirSync(dir, { recursive: true });
const logPath = join(dir, `${label}.log`);
const rel = relative(cwd, logPath).split("\\").join("/");

// The child writes STRAIGHT to the log fd rather than through a buffer this process holds:
// the log fills while the command runs, so killing the runner from outside (a caller's own
// timeout) still leaves the partial output on disk. Shell execution is intentional: gate
// commands are repo-owner-authored, exactly like stop-gate.mjs's stopGate entries.
const fd = openSync(logPath, "w");
let res;
try {
  res = spawnSync(cmd, { shell: true, stdio: ["ignore", fd, fd], timeout: timeoutSec * 1000, killSignal: "SIGKILL" });
} finally {
  closeSync(fd);
}
// Only ETIMEDOUT is a timeout. A child that died from a signal with no such error (a crash,
// an OOM kill) is a signal death, not a deadline — saying "timed out" would misdiagnose it.
const timedOut = Boolean(res.error) && res.error.code === "ETIMEDOUT";
const code = timedOut ? 124 : res.status === null ? 1 : res.status;

// Count lines by streaming (a runaway suite can write more than V8 holds in one string), and
// read only the last TAIL_BYTES for the tail; a partial first line inside that window is dropped.
function countLines(p) {
  const h = openSync(p, "r");
  try {
    const buf = Buffer.alloc(65536); let n = 0, last = 0, total = 0, got;
    while ((got = readSync(h, buf, 0, buf.length, null)) > 0) { total += got; for (let i = 0; i < got; i++) if (buf[i] === 10) n++; last = buf[got - 1]; }
    return total === 0 ? 0 : last === 10 ? n : n + 1;
  } finally { closeSync(h); }
}
function tail(p, n) {
  const h = openSync(p, "r");
  try {
    const size = fstatSync(h).size, start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    if (buf.length) readSync(h, buf, 0, buf.length, start);
    const text = buf.toString("utf8").trimEnd();
    const all = text === "" ? [] : text.split("\n");
    return (start > 0 ? all.slice(1) : all).slice(-n);
  } finally { closeSync(h); }
}
const lineCount = countLines(logPath);
const note = timedOut ? ` · timed out after ${timeoutSec}s` : res.error ? ` · error=${res.error.code}` : res.status === null && res.signal ? ` · killed by ${res.signal}` : "";
console.log(`exit=${code} · log=${rel} · ${lineCount} lines${note}`);
if (lineCount) console.log(tail(logPath, tailN).join("\n"));

try { // housekeeping: keep the newest KEEP_LOGS logs — never fail the check for it
  const logs = readdirSync(dir).filter((f) => f.endsWith(".log")).map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const { f } of logs.slice(KEEP_LOGS)) unlinkSync(join(dir, f));
} catch { /* a missing or unreadable log dir is not this check's failure */ }
process.exit(code);
