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
  try { branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim() || null; } catch {}
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
  let blocked = false; try { blocked = JSON.parse(res.out).decision === "block"; } catch {}
  let state = null; try { state = JSON.parse(readFileSync(join(tmp, ".claude", "state", "last-gate.json"), "utf8")); } catch {}
  check("red gate blocks the turn", res.code === 0 && blocked);
  check("writes last-gate.json with RED verdict + failed cmd", state?.verdict === "RED" && state?.failed?.length === 1 && !!state?.when);
}
{
  // GREEN gate: silent exit 0, last-gate.json says GREEN with no failures.
  const tmp = mkdtempSync(join(tmpdir(), "phe-gate-green-"));
  mkdirSync(join(tmp, ".claude"), { recursive: true });
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ stopGate: ["node -e \"process.exit(0)\""] }));
  const res = runHook("stop-gate.mjs", { ...base, hook_event_name: "Stop", stop_hook_active: false, cwd: tmp });
  let state = null; try { state = JSON.parse(readFileSync(join(tmp, ".claude", "state", "last-gate.json"), "utf8")); } catch {}
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
  let blocked = false, reason = ""; try { const o = JSON.parse(res.out); blocked = o.decision === "block"; reason = o.reason || ""; } catch {}
  let state = null; try { state = JSON.parse(readFileSync(join(tmp, ".claude", "state", "last-gate.json"), "utf8")); } catch {}
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
  let ctx = ""; try { ctx = JSON.parse(res.out).hookSpecificOutput.additionalContext; } catch {}
  check("hook edit triggers adjacent smoke test", res.code === 0 && ctx.includes("Hook edited") && ctx.includes("stub suite"));
  const self = runHook("post-edit.mjs", { ...base, hook_event_name: "PostToolUse", tool_name: "Edit", tool_input: { file_path: join(hooksDir, "smoke-test.mjs") } });
  check("editing smoke-test.mjs itself does not self-trigger", self.code === 0 && self.out === "");
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
  let ctx = ""; try { ctx = JSON.parse(res.out).hookSpecificOutput.additionalContext; } catch {}
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
  let ctx = ""; try { ctx = JSON.parse(res.out).hookSpecificOutput.additionalContext; } catch {}
  check("files backend injects board counts", res.code === 0 && ctx.includes("Board: 1 ready · 1 doing"));
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ workTracking: { backend: "none" } }));
  const off = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let offCtx = ""; try { offCtx = JSON.parse(off.out).hookSpecificOutput.additionalContext; } catch {}
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
  let ctx = ""; try { ctx = JSON.parse(res.out).hookSpecificOutput.additionalContext; } catch {}
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
  let ctx = ""; try { ctx = JSON.parse(res.out).hookSpecificOutput.additionalContext; } catch {}
  check("WIP breach flagged in standup", res.code === 0 && ctx.includes("WIP 2/2"));
}
{
  // Uninitialized template: session-start nudges toward /harness-init.
  const tmp = mkdtempSync(join(tmpdir(), "phe-uninit-"));
  writeFileSync(join(tmp, "CLAUDE.md"), "# <Project Name>\n<placeholder>\n");
  const res = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let ctx = ""; try { ctx = JSON.parse(res.out).hookSpecificOutput.additionalContext; } catch {}
  check("uninitialized template nudges /harness-init", res.code === 0 && ctx.includes("/harness-init"));
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
// is the documented sub-agents frontmatter schema (code.claude.com/docs/en/sub-agents).
console.log("agent frontmatter");
{
  const AGENT_KEYS = new Set([
    "name", "description", "tools", "disallowedTools", "model", "permissionMode",
    "maxTurns", "skills", "mcpServers", "hooks", "memory", "background", "effort",
    "isolation", "color", "initialPrompt",
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
  const stopTimeout = lifecycles.Stop?.[0]?.hooks?.[0]?.timeout ?? 0;
  check("Stop timeout outlasts harness stopGateTotalSec", stopTimeout >= (harness.stopGateTotalSec ?? 0),
    `Stop ${stopTimeout}s < stopGateTotalSec ${harness.stopGateTotalSec}s`);
  const postTimeout = lifecycles.PostToolUse?.[0]?.hooks?.[0]?.timeout ?? 0;
  check("PostToolUse timeout outlasts post-edit smoke budget (60s)", postTimeout >= 60,
    `PostToolUse ${postTimeout}s < 60s (post-edit.mjs runs the smoke test with a 60s budget)`);

  const subMatcher = lifecycles.SubagentStop?.[0]?.matcher;
  if (subMatcher) {
    check(`SubagentStop matcher '${subMatcher}' names a real agent`,
      existsSync(join(claudeDir, "agents", subMatcher + ".md")));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
