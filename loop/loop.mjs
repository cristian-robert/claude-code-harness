#!/usr/bin/env node
/**
 * loop.mjs — autonomous loop driver (Ralph pattern). Node 18+, zero deps.
 *
 * Re-feeds a spec file to a FRESH headless Claude process each iteration
 * until the DONE sentinel exists or --max-iter is hit. The DONE file's
 * EXISTENCE is the ONLY stop authority — model output text is never parsed
 * for doneness. Cross-iteration state lives in the repo + loop/fix_plan.md.
 *
 * SAFETY
 * - PreToolUse guard hooks (.claude/hooks/guard.mjs) STILL FIRE under
 *   --dangerously-skip-permissions and headless `claude -p`. That
 *   deterministic layer is what makes unattended runs acceptable — never
 *   run this in a repo without the guard hooks wired.
 * - Prefer --worktree: the loop then never touches your main working tree.
 * - COST: `claude -p` (this CLI headless mode) runs on your Claude Code
 *   subscription / Max plan, same as interactive. The "separate credit pool"
 *   caveat in older docs is about the Agent SDK (a different programmatic path),
 *   not this `claude` CLI invocation. Still, watch usage on long unattended runs.
 *
 * USAGE
 *   node loop/loop.mjs [--prompt loop/PROMPT.md] [--max-iter 15]
 *     [--iter-timeout-sec 1800] [--done loop/DONE.txt] [--log loop/loop.log]
 *     [--worktree] [--dry-run]
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULTS = {
  prompt: "loop/PROMPT.md", "max-iter": 15, "iter-timeout-sec": 1800,
  done: "loop/DONE.txt", log: "loop/loop.log", worktree: false, "dry-run": false,
};
const NUMERIC = new Set(["max-iter", "iter-timeout-sec"]);
const VALUED = new Set(["prompt", "done", "log", ...NUMERIC]);
const CLAUDE_ARGS = ["-p", "--output-format", "json", "--max-turns", "40", "--dangerously-skip-permissions"];

function fail(msg) { console.error(`loop: ${msg}`); process.exit(1); }

function parseArgs(argv) {
  const cfg = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) fail(`unknown argument: ${argv[i]}`);
    const name = argv[i].slice(2);
    if (!(name in cfg)) fail(`unknown flag: --${name}`);
    if (VALUED.has(name)) {
      const raw = argv[++i];
      if (raw === undefined) fail(`--${name} needs a value`);
      cfg[name] = NUMERIC.has(name) ? Number(raw) : raw;
      if (NUMERIC.has(name) && (!Number.isInteger(cfg[name]) || cfg[name] <= 0)) fail(`--${name} must be a positive integer`);
    } else cfg[name] = true;
  }
  return cfg;
}

function git(args, cwd) { return spawnSync("git", args, { cwd, encoding: "utf8" }); }

function commitIfChanged(iter, cwd) {
  const a = git(["add", "-A"], cwd);
  if (a.status !== 0) { console.error(`loop: git add failed (changes at risk):\n${a.stderr || a.error || ""}`); return false; }
  if (git(["diff", "--cached", "--quiet"], cwd).status === 0) return false; // nothing staged
  const c = git(["commit", "--no-verify", "-m", `loop: iteration ${iter}`], cwd);
  if (c.status !== 0) console.error(`loop: commit failed:\n${c.stderr || c.error || ""}`);
  return c.status === 0;
}

// claude -p --output-format json prints one JSON object; try whole output, then last lines.
function parseClaudeJson(out) {
  const t = out.trim();
  for (const chunk of [t, ...t.split(/\r?\n/).reverse()]) {
    try { const j = JSON.parse(chunk); if (j && typeof j === "object") return j; } catch { /* not JSON */ }
  }
  return null;
}

function runClaude(prompt, cwd, timeoutSec) {
  return new Promise((done) => {
    let out = "", err = "", settled = false, timedOut = false;
    let child;
    const posix = process.platform !== "win32";
    try {
      // detached on POSIX: the child gets its own process group, so a timeout
      // kill takes down agent-spawned subprocesses (dev servers, hung tests)
      // too, not just the claude process itself.
      child = spawn("claude", CLAUDE_ARGS, { cwd, stdio: ["pipe", "pipe", "pipe"], shell: !posix, detached: posix });
    } catch (e) { return done({ exit: "spawn-error", out: "", err: String(e) }); }
    const finish = (exit) => { if (!settled) { settled = true; clearTimeout(timer); done({ exit, out, err }); } };
    const killTree = () => {
      if (posix) { try { process.kill(-child.pid, "SIGKILL"); return; } catch { /* group gone; fall through */ } }
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => { timedOut = true; killTree(); }, timeoutSec * 1000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { err += String(e); finish("spawn-error"); });
    child.on("close", (code) => finish(timedOut ? "timeout" : code));
    child.stdin.on("error", () => { /* ignore EPIPE if child dies early */ });
    child.stdin.end(prompt);
  });
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  const startCwd = process.cwd();
  const promptPath = resolve(startCwd, cfg.prompt);
  if (!existsSync(promptPath) && !cfg["dry-run"]) fail(`prompt file not found: ${promptPath} (copy loop/PROMPT.template.md and fill it in)`);

  let runDir = startCwd, branch = null;
  if (cfg.worktree) {
    branch = `loop/run-${Date.now()}-${process.pid}`; // ms + pid: parallel launches can't collide
    // In-repo .worktrees/, NEVER a sibling folder — a folder appearing outside the
    // project root surprises the user (guard.mjs blocks agents from doing the same).
    runDir = resolve(startCwd, ".worktrees", branch.replaceAll("/", "-"));
    if (!cfg["dry-run"]) {
      if (git(["check-ignore", "-q", ".worktrees"], startCwd).status !== 0) {
        // Repo-local exclude: keeps .worktrees/ out of status with no .gitignore commit.
        const common = git(["rev-parse", "--git-common-dir"], startCwd);
        try {
          if (common.status === 0) appendFileSync(resolve(startCwd, common.stdout.trim(), "info", "exclude"), "\n.worktrees/\n");
        } catch { /* missing info/ dir: status noise only, never block the run */ }
      }
      const r = git(["worktree", "add", "-b", branch, runDir], startCwd);
      if (r.status !== 0) fail(`git worktree add failed:\n${r.stderr || r.error || ""}`);
    }
  }
  const donePath = resolve(runDir, cfg.done);
  const logPath = resolve(runDir, cfg.log);

  if (cfg["dry-run"]) {
    console.log(JSON.stringify({ ...cfg, runDir, branch, donePath, logPath, promptExists: existsSync(promptPath), cmd: `claude ${CLAUDE_ARGS.join(" ")}` }, null, 2));
    return 0;
  }
  if (existsSync(donePath)) { console.log(`loop: already done — ${donePath} exists. Remove it to run again.`); return 0; }
  mkdirSync(dirname(logPath), { recursive: true });

  for (let iter = 1; iter <= cfg["max-iter"]; iter++) {
    const started = new Date().toISOString();
    console.log(`--- iteration ${iter}/${cfg["max-iter"]} (${started}) ---`);
    const prompt = readFileSync(promptPath, "utf8"); // re-read each iteration: editing PROMPT.md mid-run is the steering channel
    const t0 = Date.now();
    const r = await runClaude(prompt, runDir, cfg["iter-timeout-sec"]);
    const parsed = parseClaudeJson(r.out);
    const entry = {
      iter, started, duration_s: Math.round((Date.now() - t0) / 1000), exit: r.exit,
      ...(parsed?.num_turns != null && { num_turns: parsed.num_turns }),
      ...(parsed?.total_cost_usd != null && { cost_usd: parsed.total_cost_usd }),
      result_tail: String(parsed?.result ?? (r.err || r.out)).trim().slice(-200),
    };
    appendFileSync(logPath, JSON.stringify(entry) + "\n");
    console.log(`exit=${entry.exit} turns=${entry.num_turns ?? "?"} cost_usd=${entry.cost_usd ?? "?"} duration=${entry.duration_s}s`);
    if (r.exit === "spawn-error") fail(`could not run \`claude\` (${entry.result_tail}). Is the CLI on PATH?`);
    if (commitIfChanged(iter, runDir)) console.log(`committed: loop: iteration ${iter}`);
    if (existsSync(donePath)) {
      console.log(`DONE sentinel found — spec complete after ${iter} iteration(s).`);
      if (branch) console.log(`review: cd ${runDir} && git log --oneline · merge branch ${branch} or remove the worktree to discard.`);
      return 0;
    }
  }
  console.error(`loop: did not converge — ${cfg["max-iter"]} iterations without ${cfg.done}.`);
  console.error(`Review ${logPath} and loop/fix_plan.md, tighten PROMPT.md spec items/guardrails, then rerun.`);
  if (branch) console.error(`work so far is committed on branch ${branch} at ${runDir}`);
  return 1;
}

process.on("uncaughtException", (e) => { console.error(`loop: driver error: ${e?.stack ?? e}`); process.exit(1); });
main().then((code) => process.exit(code)).catch((e) => { console.error(`loop: driver error: ${e?.stack ?? e}`); process.exit(1); });
