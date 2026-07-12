#!/usr/bin/env node
// Hook smoke test: pipes real fixture events (stdin JSON — the actual platform
// contract) through every hook and asserts behavior. Run after ANY hook change:
//   node .claude/hooks/smoke-test.mjs
// Exists because hooks that read argv instead of stdin, or emit the wrong JSON
// shape, fail SILENTLY — they just never fire. This catches that class.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";

const HOOKS = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;

function runHook(script, event) {
  try {
    const out = execFileSync("node", [join(HOOKS, script)], {
      input: JSON.stringify(event), encoding: "utf8", timeout: 20000,
      stdio: ["pipe", "pipe", "pipe"], // capture stderr too (verdict-gate writes there)
    });
    return { code: 0, out: out.trim() };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout || ""}`.trim(), err: `${err.stderr || ""}`.trim() };
  }
}

function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

function denies(res) {
  try { return JSON.parse(res.out).hookSpecificOutput?.permissionDecision === "deny"; }
  catch { return false; }
}

// Resolve a harness hook's timeout by its SCRIPT NAME, anywhere in its lifecycle.
// NEVER by array position: cli/merge-settings.js unions an adopter's prior hooks
// FIRST, so on every adoption install index [0] is THEIR hook, not ours. Position
// lookup both false-FAILED a correct install (reading a prior hook's absent
// timeout as 0s) and could false-PASS (a prior hook's long timeout masking a
// short one on ours — the direction that actually kills a hook mid-run).
// Returns null when the script is not wired at all — a wiring gap, not a 0s budget.
function hookTimeout(lifecycle, script) {
  const isScript = (a) => {
    const s = String(a);
    // Path-boundary match: a bare endsWith would let "gate.mjs" resolve against
    // ".../stop-gate.mjs" and hand back the wrong hook's timeout.
    return s === script || s.endsWith("/" + script) || s.endsWith("\\" + script);
  };
  for (const entry of lifecycle || []) {
    for (const h of entry.hooks || []) {
      if ((h.args || []).some(isScript)) return h.timeout ?? 0;
    }
  }
  return null;
}

const base = { session_id: "smoke", cwd: process.cwd(), hook_event_name: "PreToolUse" };

console.log("guard.mjs");
check("denies Read of .env", denies(runHook("guard.mjs", { ...base, tool_name: "Read", tool_input: { file_path: "/x/.env" } })));
check("denies Read of .env.production", denies(runHook("guard.mjs", { ...base, tool_name: "Read", tool_input: { file_path: "/x/.env.production" } })));
check("allows Read of .env.example", !denies(runHook("guard.mjs", { ...base, tool_name: "Read", tool_input: { file_path: "/x/.env.example" } })));
check("allows Read of normal file", !denies(runHook("guard.mjs", { ...base, tool_name: "Read", tool_input: { file_path: "/x/src/app.ts" } })));
check("denies Bash cat .env", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "cat .env" } })));
// Bash key-file parity with the Read branch — these were silently ALLOWED before.
check("denies Bash cat *.pem", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "cat server.pem" } })));
check("denies Bash cat id_rsa", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "cat ~/.ssh/id_rsa" } })));
check("denies Bash cat credentials.json", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "cat config/credentials.json" } })));
check("denies Bash reading a secrets/ file", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "cat secrets/prod.json" } })));
// .env template variants are NOT secrets — allowed on Bash too (matches Read).
check("allows Bash cat .env.sample", !denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "cat .env.sample" } })));
check("allows Bash cat .env.template", !denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "cat .env.template" } })));
// A quoted secret read inside $()/backtick substitution must NOT slip through.
check("denies Bash secret via $() substitution", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: 'echo "loaded: $(cat ~/.ssh/id_rsa)"' } })));
check("denies Bash secret via backticks", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "X=`cat server.pem`" } })));
check("denies Bash secret via process substitution <()", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "diff <(cat server.pem) b" } })));
check("denies Bash secret glued to a redirect", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "cat id_rsa>/tmp/x" } })));
check("denies Bash secret via sh -c wrapper", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: 'bash -c "cat ~/.ssh/id_rsa"' } })));
check("denies Bash secret via python -c wrapper", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "python3 -c \"print(open('config/credentials.json').read())\"" } })));
// Fail-safe: a secret FILENAME anywhere (even prose) is denied — we cannot tell a
// real path from prose without shell semantics, and over-blocking is the safe side.
check("denies secret filename in prose (fail-safe)", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: 'echo "rotate server.pem now"' } })));
// Guard against over-blocking ordinary, non-secret commands.
check("allows Bash cat package.json", !denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "cat package.json" } })));
check("allows Bash normal echo", !denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "echo hello world" } })));
check("denies Bash rm -rf", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "rm -rf build" } })));
check("denies Bash find -delete", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "find . -name '*.tmp' -delete" } })));
check("allows Bash rm single file", !denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "rm build/out.js" } })));
check("denies Grep on .env", denies(runHook("guard.mjs", { ...base, tool_name: "Grep", tool_input: { pattern: "KEY", path: ".env" } })));
check("survives malformed input (fail-open)", runHook("guard.mjs", null).code === 0);
{
  // Branch guard behaves per the CURRENT repo branch: deny on main/master, allow elsewhere.
  const res = runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "git commit -m x" } });
  let branch = null; // same detection as guard.mjs: works on unborn branches too
  try { branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim() || null; } catch { /* not a git repo: branch stays null */ }
  if (branch === "main" || branch === "master") check("denies git commit on protected branch", denies(res));
  else check(`allows git commit on '${branch}'`, !denies(res));
  check("allows message mentioning main", !denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "echo 'main topic' > notes.txt" } })));
}
{
  // Opt-in evolve->push gate: armed + no marker => deny push; marker fresh => allow.
  const tmp = mkdtempSync(join(tmpdir(), "phe-pushgate-"));
  execFileSync("git", ["init", "-q", "-b", "feat/x", tmp]);
  execFileSync("git", ["-C", tmp, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-q", "-m", "x"]);
  mkdirSync(join(tmp, ".claude", "state"), { recursive: true });
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ requireEvolveBeforePush: true }));
  const denied = runHook("guard.mjs", { ...base, cwd: tmp, tool_name: "Bash", tool_input: { command: "git push origin feat/x" } });
  check("armed push gate denies push without evolve marker", denies(denied));
  writeFileSync(join(tmp, ".claude", "state", ".evolve-ran"), new Date().toISOString());
  const allowed = runHook("guard.mjs", { ...base, cwd: tmp, tool_name: "Bash", tool_input: { command: "git push origin feat/x" } });
  check("fresh evolve marker allows push", !denies(allowed));
  const unarmed = mkdtempSync(join(tmpdir(), "phe-pushgate-off-"));
  execFileSync("git", ["init", "-q", "-b", "feat/y", unarmed]);
  check("push gate off by default (no config)", !denies(runHook("guard.mjs", { ...base, cwd: unarmed, tool_name: "Bash", tool_input: { command: "git push" } })));
}
{
  // Tracking-only commits are allowed on protected branches; mixed commits stay blocked.
  const tmp = mkdtempSync(join(tmpdir(), "phe-track-"));
  execFileSync("git", ["init", "-q", "-b", "master", tmp]);
  mkdirSync(join(tmp, "backlog"), { recursive: true });
  writeFileSync(join(tmp, "backlog", "001-a.md"), "---\nstatus: doing\n---\n");
  execFileSync("git", ["-C", tmp, "add", "backlog/001-a.md"]);
  const trackRes = runHook("guard.mjs", { ...base, cwd: tmp, tool_name: "Bash", tool_input: { command: "git commit -m 'track(001): doing'" } });
  check("tracking-only commit allowed on master", !denies(trackRes));
  writeFileSync(join(tmp, "app.js"), "code\n");
  execFileSync("git", ["-C", tmp, "add", "app.js"]);
  const mixedRes = runHook("guard.mjs", { ...base, cwd: tmp, tool_name: "Bash", tool_input: { command: "git commit -m 'mixed'" } });
  check("mixed commit still denied on master", denies(mixedRes));
}
{
  // `git -C <repo>` targets a DIFFERENT dir than the session cwd — the guard must
  // resolve it, or `git -C <tracking-root-on-main> commit` evades the branch check.
  const repo = mkdtempSync(join(tmpdir(), "phe-gitC-"));
  execFileSync("git", ["init", "-q", "-b", "master", repo]);
  writeFileSync(join(repo, "app.js"), "code\n");
  execFileSync("git", ["-C", repo, "add", "app.js"]);
  const fromElsewhere = runHook("guard.mjs", { ...base, cwd: "/tmp", tool_name: "Bash", tool_input: { command: `git -C ${repo} commit -m x` } });
  check("git -C code commit on master denied from any cwd", denies(fromElsewhere));
  // tracking-only git -C commit stays allowed
  mkdirSync(join(repo, "backlog"), { recursive: true });
  writeFileSync(join(repo, "backlog", "001-a.md"), "---\nstatus: doing\n---\n");
  execFileSync("git", ["-C", repo, "reset", "-q"]);
  execFileSync("git", ["-C", repo, "add", "backlog/001-a.md"]);
  const trackC = runHook("guard.mjs", { ...base, cwd: "/tmp", tool_name: "Bash", tool_input: { command: `git -C ${repo} commit -m 'track(001): doing'` } });
  check("git -C tracking-only commit on master allowed", !denies(trackC));
}
{
  // An unrelated `git -C <fake>` earlier in the command must NOT steer cwd away
  // from the real `git commit` on a protected branch (decoy-segment bypass).
  const repo = mkdtempSync(join(tmpdir(), "phe-segbypass-"));
  execFileSync("git", ["init", "-q", "-b", "master", repo]);
  writeFileSync(join(repo, "app.js"), "code\n");
  execFileSync("git", ["-C", repo, "add", "app.js"]);
  const bypass = runHook("guard.mjs", { ...base, cwd: repo, tool_name: "Bash", tool_input: { command: "echo git -C /definitely/not/a/repo ; git commit -m x" } });
  check("decoy `git -C` in echo does not bypass the commit deny", denies(bypass));
}
{
  // A -C-like token inside the commit MESSAGE must not steer resolution away
  // from the real repo — code commit on master stays denied (Opus finding).
  const repo = mkdtempSync(join(tmpdir(), "phe-msgflag-"));
  execFileSync("git", ["init", "-q", "-b", "master", repo]);
  writeFileSync(join(repo, "app.js"), "code\n");
  execFileSync("git", ["-C", repo, "add", "app.js"]);
  const msg = runHook("guard.mjs", { ...base, cwd: repo, tool_name: "Bash", tool_input: { command: "git commit -m 'add -C support to the CLI'" } });
  check("-C token in commit message does not bypass deny", denies(msg));
}
{
  // A quoted `;` inside a git arg must not hide the commit from detection
  // (Codex final finding) — code commit on master stays denied.
  const repo = mkdtempSync(join(tmpdir(), "phe-quotesep-"));
  execFileSync("git", ["init", "-q", "-b", "master", repo]);
  writeFileSync(join(repo, "app.js"), "code\n");
  execFileSync("git", ["-C", repo, "add", "app.js"]);
  const q = runHook("guard.mjs", { ...base, cwd: repo, tool_name: "Bash", tool_input: { command: 'git -c user.name="a;b" commit -m x' } });
  check("quoted ; in git arg does not hide the commit deny", denies(q));
}
{
  // A repo path whose name contains the word "commit" must not truncate the
  // -C extraction early (Opus final finding) — code on master stays denied.
  const parent = mkdtempSync(join(tmpdir(), "phe-pathword-"));
  const repo = join(parent, "commit-repo");
  mkdirSync(repo, { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "master", repo]);
  writeFileSync(join(repo, "app.js"), "code\n");
  execFileSync("git", ["-C", repo, "add", "app.js"]);
  const r = runHook("guard.mjs", { ...base, cwd: "/tmp", tool_name: "Bash", tool_input: { command: `git -C ${repo} commit -m x` } });
  check("commit/push word inside -C path does not defeat the deny", denies(r));
}
{
  // Read-only git commands with "commit"/"push" in an arg must NOT be denied
  // (Codex over-block) — subcommand detection, not substring.
  const repo = mkdtempSync(join(tmpdir(), "phe-readonly-"));
  execFileSync("git", ["init", "-q", "-b", "master", repo]);
  execFileSync("git", ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-q", "-m", "seed"]);
  const grep = runHook("guard.mjs", { ...base, cwd: repo, tool_name: "Bash", tool_input: { command: "git log --grep=commit" } });
  check("read-only `git log --grep=commit` on master is allowed", !denies(grep));
  const show = runHook("guard.mjs", { ...base, cwd: repo, tool_name: "Bash", tool_input: { command: "git show --stat HEAD" } });
  check("read-only `git show` on master is allowed", !denies(show));
}
{
  // --git-dir/--work-tree SPACE form must resolve the target repo (Codex under-block).
  const repo = mkdtempSync(join(tmpdir(), "phe-gitdir-"));
  execFileSync("git", ["init", "-q", "-b", "master", repo]);
  writeFileSync(join(repo, "app.js"), "code\n");
  execFileSync("git", ["-C", repo, "add", "app.js"]);
  const sp = runHook("guard.mjs", { ...base, cwd: "/tmp", tool_name: "Bash", tool_input: { command: `git --git-dir ${repo}/.git --work-tree ${repo} commit -m x` } });
  check("--git-dir/--work-tree space form resolves target -> deny code on master", denies(sp));
}
{
  // Chained double commit: a SECOND `git -C <main> commit` must be caught even
  // when the first targets a feature branch (Codex under-block — was .find()).
  const feat = mkdtempSync(join(tmpdir(), "phe-chain-feat-"));
  execFileSync("git", ["init", "-q", "-b", "feat/x", feat]);
  writeFileSync(join(feat, "a.js"), "x\n"); execFileSync("git", ["-C", feat, "add", "a.js"]);
  const main = mkdtempSync(join(tmpdir(), "phe-chain-main-"));
  execFileSync("git", ["init", "-q", "-b", "master", main]);
  writeFileSync(join(main, "b.js"), "y\n"); execFileSync("git", ["-C", main, "add", "b.js"]);
  const chain = runHook("guard.mjs", { ...base, cwd: "/tmp", tool_name: "Bash", tool_input: { command: `git -C ${feat} commit -m x && git -C ${main} commit -m x` } });
  check("chained commit: second on master is caught -> deny", denies(chain));
}
{
  // Configured baseBranch (develop) is protected in addition to main/master.
  const tmp = mkdtempSync(join(tmpdir(), "phe-basebranch-"));
  execFileSync("git", ["init", "-q", "-b", "develop", tmp]);
  mkdirSync(join(tmp, ".claude"), { recursive: true });
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ baseBranch: "develop" }));
  const res = runHook("guard.mjs", { ...base, cwd: tmp, tool_name: "Bash", tool_input: { command: "git commit -m x" } });
  check("configured baseBranch (develop) is protected", denies(res));
}

console.log("stop-gate.mjs");
check("exits 0 when stop_hook_active", runHook("stop-gate.mjs", { ...base, hook_event_name: "Stop", stop_hook_active: true }).code === 0);
{
  const res = runHook("stop-gate.mjs", { ...base, hook_event_name: "Stop", stop_hook_active: false, cwd: "/tmp" });
  check("silent when no harness.json", res.code === 0 && res.out === "");
}
check("survives malformed input (fail-open)", runHook("stop-gate.mjs", null).code === 0);

{
  // RED gate: blocks AND records the failing command in last-gate.json.
  const tmp = mkdtempSync(join(tmpdir(), "phe-gate-red-"));
  mkdirSync(join(tmp, ".claude"), { recursive: true });
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ stopGate: ["node -e \"process.exit(1)\""] }));
  const res = runHook("stop-gate.mjs", { ...base, hook_event_name: "Stop", stop_hook_active: false, cwd: tmp });
  let blocked = false; try { blocked = JSON.parse(res.out).decision === "block"; } catch { /* non-JSON stdout: not a block */ }
  let state = null; try { state = JSON.parse(readFileSync(join(tmp, ".claude", "state", "last-gate.json"), "utf8")); } catch { /* no/!JSON state file: the check below reports it */ }
  check("red gate blocks the turn", res.code === 0 && blocked);
  check("writes last-gate.json with RED verdict + failed cmd", state?.verdict === "RED" && state?.failed?.length === 1 && !!state?.when);
}
{
  // GREEN gate: silent exit 0, last-gate.json says GREEN with no failures.
  const tmp = mkdtempSync(join(tmpdir(), "phe-gate-green-"));
  mkdirSync(join(tmp, ".claude"), { recursive: true });
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ stopGate: ["node -e \"process.exit(0)\""] }));
  const res = runHook("stop-gate.mjs", { ...base, hook_event_name: "Stop", stop_hook_active: false, cwd: tmp });
  let state = null; try { state = JSON.parse(readFileSync(join(tmp, ".claude", "state", "last-gate.json"), "utf8")); } catch { /* no/!JSON state file: the check below reports it */ }
  check("green gate exits 0 silently", res.code === 0 && res.out === "");
  check("writes last-gate.json with GREEN verdict", state?.verdict === "GREEN" && Array.isArray(state?.failed) && state.failed.length === 0 && !!state?.when);
}
{
  // INCOMPLETE gate: with a 1s total budget the second check is skipped after the
  // first runs — a partial run must BLOCK, never report GREEN.
  const tmp = mkdtempSync(join(tmpdir(), "phe-gate-incomplete-"));
  mkdirSync(join(tmp, ".claude"), { recursive: true });
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ stopGate: ["node -e \"process.exit(0)\"", "node -e \"process.exit(0)\""], stopGateTotalSec: 1 }));
  const res = runHook("stop-gate.mjs", { ...base, hook_event_name: "Stop", stop_hook_active: false, cwd: tmp });
  let blocked = false, reason = ""; try { const o = JSON.parse(res.out); blocked = o.decision === "block"; reason = o.reason || ""; } catch { /* non-JSON stdout: neither blocked nor reasoned */ }
  let state = null; try { state = JSON.parse(readFileSync(join(tmp, ".claude", "state", "last-gate.json"), "utf8")); } catch { /* no/!JSON state file: the check below reports it */ }
  check("skipped check blocks as INCOMPLETE, never GREEN", res.code === 0 && blocked && reason.includes("INCOMPLETE"));
  check("last-gate.json records INCOMPLETE + skipped", state?.verdict === "INCOMPLETE" && state?.skipped?.length >= 1);
}

console.log("post-edit.mjs");
check("silent on unknown file type", runHook("post-edit.mjs", { ...base, hook_event_name: "PostToolUse", tool_name: "Write", tool_input: { file_path: "/tmp/nonexistent.xyz" } }).code === 0);
check("survives malformed input", runHook("post-edit.mjs", null).code === 0);
{
  // Editing a hook runs the smoke test that sits NEXT TO the edited hook —
  // fixture uses a stub suite so the real suite isn't recursively re-run.
  const tmp = mkdtempSync(join(tmpdir(), "phe-postedit-"));
  const hooksDir = join(tmp, ".claude", "hooks");
  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(join(hooksDir, "smoke-test.mjs"), "console.log('stub suite: 1 passed, 0 failed');\n");
  writeFileSync(join(hooksDir, "guard.mjs"), "// stub hook\n");
  const res = runHook("post-edit.mjs", { ...base, hook_event_name: "PostToolUse", tool_name: "Edit", tool_input: { file_path: join(hooksDir, "guard.mjs") } });
  let ctx = ""; try { ctx = JSON.parse(res.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: ctx stays "" and the check fails */ }
  check("hook edit triggers adjacent smoke test", res.code === 0 && ctx.includes("Hook edited") && ctx.includes("stub suite"));
  const self = runHook("post-edit.mjs", { ...base, hook_event_name: "PostToolUse", tool_name: "Edit", tool_input: { file_path: join(hooksDir, "smoke-test.mjs") } });
  check("editing smoke-test.mjs itself does not self-trigger", self.code === 0 && self.out === "");
}

// The user's LOCAL calendar date (what /models records), not the UTC one.
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

console.log("session-start.mjs");
{
  const res = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup" });
  check("exits 0 and emits valid JSON or nothing", res.code === 0 && (res.out === "" || !!JSON.parse(res.out).hookSpecificOutput));
}
{
  // source: "compact" with a fresh snapshot => snapshot re-injected + warning.
  const tmp = mkdtempSync(join(tmpdir(), "phe-compact-"));
  mkdirSync(join(tmp, ".claude", "state"), { recursive: true });
  writeFileSync(join(tmp, ".claude", "state", "compact-snapshot.md"), "# Compact snapshot\n- when: now\n- branch: feature/x\n");
  const res = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "compact", cwd: tmp });
  let ctx = ""; try { ctx = JSON.parse(res.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: ctx stays "" and the check fails */ }
  check("compact source re-injects snapshot + dropped-context warning", res.code === 0 && ctx.includes("Compaction dropped") && ctx.includes("feature/x"));
}
{
  // workTracking backend "files": one derived Board line from backlog frontmatter.
  const tmp = mkdtempSync(join(tmpdir(), "phe-board-"));
  mkdirSync(join(tmp, ".claude"), { recursive: true });
  mkdirSync(join(tmp, "backlog"), { recursive: true });
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ workTracking: { backend: "files", method: "kanban", wipLimit: 3 } }));
  writeFileSync(join(tmp, "backlog", "0001-login-form.md"), "---\nid: 0001\ntype: story\nstatus: ready\npriority: P1\n---\n\n## Story\n");
  writeFileSync(join(tmp, "backlog", "0002-fix-auth.md"), "---\nid: 0002\ntype: bug\nstatus: doing\npriority: P0\n---\n\n## Story\n");
  const res = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let ctx = ""; try { ctx = JSON.parse(res.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: ctx stays "" and the check fails */ }
  check("files backend injects board counts", res.code === 0 && ctx.includes("Board: 1 ready · 1 doing"));
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ workTracking: { backend: "none" } }));
  const off = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let offCtx = ""; try { offCtx = JSON.parse(off.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: offCtx stays "" */ }
  check("backend none emits no Board line", off.code === 0 && !offCtx.includes("Board:"));
}
{
  // github backend: files stay canonical — Board line still renders from local files.
  const tmp = mkdtempSync(join(tmpdir(), "phe-board-gh-"));
  mkdirSync(join(tmp, ".claude"), { recursive: true });
  mkdirSync(join(tmp, "backlog"), { recursive: true });
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ workTracking: { backend: "github", method: "kanban" } }));
  writeFileSync(join(tmp, "backlog", "001-a.md"), "---\nid: 001\nstatus: ready\n---\n");
  const res = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let ctx = ""; try { ctx = JSON.parse(res.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: ctx stays "" and the check fails */ }
  check("github backend still renders Board from files", res.code === 0 && ctx.includes("Board: 1 ready"));
}
{
  // Kanban WIP breach surfaces in the standup line when doing >= wipLimit.
  const tmp = mkdtempSync(join(tmpdir(), "phe-wip-"));
  mkdirSync(join(tmp, ".claude"), { recursive: true });
  mkdirSync(join(tmp, "backlog"), { recursive: true });
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ workTracking: { backend: "files", method: "kanban", wipLimit: 2 } }));
  writeFileSync(join(tmp, "backlog", "001-a.md"), "---\nstatus: doing\n---\n");
  writeFileSync(join(tmp, "backlog", "002-b.md"), "---\nstatus: doing\n---\n");
  const res = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let ctx = ""; try { ctx = JSON.parse(res.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: ctx stays "" and the check fails */ }
  check("WIP breach flagged in standup", res.code === 0 && ctx.includes("WIP 2/2"));
}
{
  // Uninitialized template: session-start nudges toward /harness-init.
  const tmp = mkdtempSync(join(tmpdir(), "phe-uninit-"));
  writeFileSync(join(tmp, "CLAUDE.md"), "# <Project Name>\n<placeholder>\n");
  const res = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let ctx = ""; try { ctx = JSON.parse(res.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: ctx stays "" and the check fails */ }
  check("uninitialized template nudges /harness-init", res.code === 0 && ctx.includes("/harness-init"));
}
{
  // A model map nobody has re-checked is how a retired model ID stays in the dispatch
  // path long after the vendor pulled it. Staleness must be LOUD, at session start.
  const tmp = mkdtempSync(join(tmpdir(), "phe-models-stale-"));
  mkdirSync(join(tmp, ".claude"), { recursive: true });
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({
    stopGate: [],
    models: { checkedAt: "2020-01-01", staleDays: 30, claude: { scout: "haiku", build: "sonnet", deep: "opus" } },
  }));
  const res = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let ctx = ""; try { ctx = JSON.parse(res.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: ctx stays "" and the check fails */ }
  check("stale model map warns and names /models", res.code === 0 && ctx.includes("Model map is stale") && ctx.includes("/models"));

  // Fresh map: silent. A warning that fires every session is a warning nobody reads.
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({
    stopGate: [],
    // The user's LOCAL date — what /models actually writes. NOT toISOString() (UTC):
    // east of UTC those differ, and a bare date parses as midnight UTC, so a map checked
    // "today" looks FUTURE-dated. A UTC fixture here passes while the real case fails.
    models: { checkedAt: localToday(), staleDays: 30, claude: { deep: "opus" } },
  }));
  const fresh = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let freshCtx = ""; try { freshCtx = JSON.parse(fresh.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: freshCtx stays "" */ }
  check("fresh model map emits no staleness warning", fresh.code === 0 && !freshCtx.includes("Model map is stale"));

  // No models key at all (an adopter who never ran /models): say nothing. Absent config
  // is not a stale map — nagging about a feature they never opted into is noise.
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ stopGate: [] }));
  const none = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let noneCtx = ""; try { noneCtx = JSON.parse(none.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: noneCtx stays "" */ }
  check("no models key emits no staleness warning", none.code === 0 && !noneCtx.includes("Model map is stale"));
}
check("survives malformed input", runHook("session-start.mjs", null).code === 0);

console.log("pre-compact.mjs");
{
  const tmp = mkdtempSync(join(tmpdir(), "phe-precompact-"));
  const res = runHook("pre-compact.mjs", { ...base, hook_event_name: "PreCompact", trigger: "auto", cwd: tmp });
  const snap = join(tmp, ".claude", "state", "compact-snapshot.md");
  check("writes snapshot and exits 0", res.code === 0 && existsSync(snap));
  check("snapshot carries a timestamp", existsSync(snap) && readFileSync(snap, "utf8").includes("- when: "));
}
check("survives malformed input (fail-open)", runHook("pre-compact.mjs", null).code === 0);

console.log("verdict-gate.mjs");
{
  const vg = { ...base, hook_event_name: "SubagentStop", agent_type: "code-reviewer" };
  const bad = runHook("verdict-gate.mjs", { ...vg, last_assistant_message: "Here is my review...\nPASS" });
  check("exit 2 + stderr guidance on bad first line", bad.code === 2 && (bad.err || "").includes("PASS or REQUEST_CHANGES"));
  check("exit 0 on PASS first line", runHook("verdict-gate.mjs", { ...vg, last_assistant_message: "PASS\nNo blocking issues found." }).code === 0);
  check("exit 0 on REQUEST_CHANGES first line", runHook("verdict-gate.mjs", { ...vg, last_assistant_message: "REQUEST_CHANGES\n- fix X" }).code === 0);
  check("exit 0 when stop_hook_active (loop guard)", runHook("verdict-gate.mjs", { ...vg, stop_hook_active: true, last_assistant_message: "garbage" }).code === 0);
  check("exit 0 when message absent", runHook("verdict-gate.mjs", vg).code === 0);
  check("survives malformed input (fail-open)", runHook("verdict-gate.mjs", null).code === 0);
}

// Mechanical proof that agent frontmatter uses only real subagent keys — a wrong
// key (e.g. the globs:/paths: class of typo) fails SILENTLY at runtime. Allowlist
// is the documented sub-agents frontmatter schema (code.claude.com/docs/en/sub-agents),
// plus `tier` — a PHE-defined cross-harness key the Codex emitter resolves to a model;
// Claude Code itself ignores it, same as any other unknown key.
console.log("agent frontmatter");
{
  const AGENT_KEYS = new Set([
    "name", "description", "tools", "disallowedTools", "model", "permissionMode",
    "maxTurns", "skills", "mcpServers", "hooks", "memory", "background", "effort",
    "isolation", "color", "initialPrompt", "tier",
  ]);
  const agentsDir = join(dirname(HOOKS), "agents");
  let files = [];
  try { files = readdirSync(agentsDir).filter(f => f.endsWith(".md")); } catch { /* no agents dir */ }
  for (const f of files) {
    const text = readFileSync(join(agentsDir, f), "utf8");
    const m = /^---\n([\s\S]*?)\n---/.exec(text);
    const keys = m ? [...m[1].matchAll(/^([A-Za-z][\w-]*)\s*:/gm)].map(x => x[1]) : [];
    const bad = keys.filter(k => !AGENT_KEYS.has(k));
    check(`${f}: frontmatter keys all in documented schema`, m && bad.length === 0, bad.length ? `unknown: ${bad.join(", ")}` : "no frontmatter");
  }
}

// The checks above run each hook directly; this block asserts the actual
// settings.json WIRING (referenced files exist, timeouts are sane, SubagentStop
// matcher names a real agent) so a broken path/timeout/matcher can't ship green.
console.log("settings.json wiring");
{
  const claudeDir = dirname(HOOKS);
  let settings = {};
  try { settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf8")); }
  catch (e) { check("settings.json parses", false, e.message); }
  let harness = {};
  try { harness = JSON.parse(readFileSync(join(claudeDir, "harness.json"), "utf8")); } catch { /* optional */ }
  const lifecycles = settings.hooks || {};

  let missing = "";
  for (const lc of Object.keys(lifecycles)) {
    for (const entry of lifecycles[lc] || []) {
      for (const h of entry.hooks || []) {
        // Scan every arg (not just the last) for a hook script — robust if a
        // future entry appends trailing CLI args after the .mjs path.
        for (const arg of h.args || []) {
          const m = /([^/\\]+\.mjs)$/.exec(arg);
          if (m && !existsSync(join(HOOKS, m[1]))) missing = m[1];
        }
      }
    }
  }
  check("every settings.json hook file exists on disk", !missing, missing && `missing ${missing}`);

  // A hook killed by its outer timeout fails silently. Stop must outlast the gate
  // budget; PostToolUse must outlast post-edit's internal smoke-test budget (60s).
  // Resolved by script name — the merge does not guarantee position (see hookTimeout).
  const stopTimeout = hookTimeout(lifecycles.Stop, "stop-gate.mjs");
  check("Stop timeout outlasts harness stopGateTotalSec", stopTimeout !== null && stopTimeout >= (harness.stopGateTotalSec ?? 0),
    stopTimeout === null ? "stop-gate.mjs not wired into Stop" : `stop-gate.mjs ${stopTimeout}s < stopGateTotalSec ${harness.stopGateTotalSec}s`);
  const postTimeout = hookTimeout(lifecycles.PostToolUse, "post-edit.mjs");
  check("PostToolUse timeout outlasts post-edit smoke budget (60s)", postTimeout !== null && postTimeout >= 60,
    postTimeout === null ? "post-edit.mjs not wired into PostToolUse" : `post-edit.mjs ${postTimeout}s < 60s`);

  const subMatcher = lifecycles.SubagentStop?.[0]?.matcher;
  if (subMatcher) {
    check(`SubagentStop matcher '${subMatcher}' names a real agent`,
      existsSync(join(claudeDir, "agents", subMatcher + ".md")));
  }
}

// The merge prepends the adopter's hooks, so the timeout assertions above must be
// position-independent. This pins that: a prior hook with NO timeout sitting at
// index [0] must not be mistaken for ours.
console.log("hook resolution (merged settings)");
{
  const merged = [{ hooks: [
    { type: "command", command: "node", args: ["./legacy/notify.mjs"] },
    { type: "command", command: "node", args: ["${CLAUDE_PROJECT_DIR}/.claude/hooks/stop-gate.mjs"], timeout: 90 },
  ] }];
  check("timeout resolves by script name, not array position", hookTimeout(merged, "stop-gate.mjs") === 90,
    `got ${hookTimeout(merged, "stop-gate.mjs")}`);
  check("an unwired script resolves to null, not 0s", hookTimeout(merged, "post-edit.mjs") === null);
  check("a wired script with no timeout resolves to 0s", hookTimeout(merged, "notify.mjs") === 0);
  check("a filename suffix does not match a longer script name", hookTimeout(merged, "gate.mjs") === null);
}

// A catch that swallows must say why. Beyond readability this is eslint `no-empty`:
// adopting repos run `eslint .` across the whole tree, and a harness that cannot pass
// js.configs.recommended turns the install commit red — after which /harness-init may
// arm `lint` as a stop gate that is red on EVERY turn. (The companion `no-undef` errors
// are config, not code: .claude/tooling/eslint.harness.mjs supplies the Node globals.)
// Scanned over the whole file, not line-by-line — `catch {` … `}` spans two lines and
// eslint flags it just the same.
console.log("shipped .mjs lint hygiene");
{
  const claudeDir = dirname(HOOKS);
  const files = [
    ...readdirSync(HOOKS).filter((f) => f.endsWith(".mjs")).map((f) => join(HOOKS, f)),
    join(claudeDir, "statusline.mjs"),
  ].filter(existsSync);
  const offenders = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/\bcatch\s*(\([^)]*\))?\s*\{\s*\}/g)) {
      offenders.push(`${f.split("/").pop()}:${text.slice(0, m.index).split("\n").length}`);
    }
  }
  check("no empty catch block (eslint no-empty) — every swallow carries a comment",
    offenders.length === 0, offenders.join(", "));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
