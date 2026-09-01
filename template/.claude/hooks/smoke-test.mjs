#!/usr/bin/env node
// Hook smoke test: pipes real fixture events (stdin JSON — the actual platform
// contract) through every hook and asserts behavior. Run after ANY hook change:
//   node .claude/hooks/smoke-test.mjs
// Exists because hooks that read argv instead of stdin, or emit the wrong JSON
// shape, fail SILENTLY — they just never fire. This catches that class.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, unlinkSync } from "node:fs";
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
// Environment dumps ARE secret reads (coleam00/skills audit, 2026-09-01): blocking
// the .env file but not `printenv` guards one door of two. `env FOO=1 cmd` stays
// allowed — only a BARE env (piped/redirected/terminal) is a dump.
check("denies Bash printenv", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "printenv" } })));
check("denies Bash bare env piped", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "env | sort" } })));
check("allows Bash env-prefixed command", !denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "env FOO=1 npm test" } })));
check("denies Bash echo of secret-named var", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "echo $OPENAI_API_KEY" } })));
check("allows Bash echo of benign var", !denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "echo $PATH" } })));
check("denies Bash node -p process.env", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "node -p process.env" } })));
check("denies Bash python -c os.environ", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "python3 -c 'import os; print(dict(os.environ))'" } })));
check("allows Bash grep for process.env", !denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "grep -rn process.env src/" } })));
check("denies Bash /proc/self/environ", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "cat /proc/self/environ" } })));
// Quote-folding: a shell resolves cat .e'nv' and cat .env identically; a
// fragment split on the quote does not — fold quotes, then re-scan.
check("denies Bash quote-split .env", denies(runHook("guard.mjs", { ...base, tool_name: "Bash", tool_input: { command: "cat .e'nv'" } })));
check("denies Read of .netrc", denies(runHook("guard.mjs", { ...base, tool_name: "Read", tool_input: { file_path: "/home/u/.netrc" } })));
check("denies Read of .aws/credentials", denies(runHook("guard.mjs", { ...base, tool_name: "Read", tool_input: { file_path: "/home/u/.aws/credentials" } })));
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
  // Worktrees stay INSIDE the project root — a sibling folder (../wt-x) appearing
  // next to the repo reads as the agent going rogue on the user's filesystem.
  // Traces to: /implement's old ../wt-<slug> convention, 2026-07-14 incident.
  const repo = mkdtempSync(join(tmpdir(), "phe-wtguard-"));
  execFileSync("git", ["init", "-q", "-b", "master", repo]);
  const esc = runHook("guard.mjs", { ...base, cwd: repo, tool_name: "Bash", tool_input: { command: "git worktree add -b feat/x ../wt-x" } });
  check("denies git worktree add escaping the project root", denies(esc));
  const inRepo = runHook("guard.mjs", { ...base, cwd: repo, tool_name: "Bash", tool_input: { command: "git worktree add -b feat/x .worktrees/x" } });
  check("allows git worktree add inside .worktrees/", !denies(inRepo));
  const list = runHook("guard.mjs", { ...base, cwd: repo, tool_name: "Bash", tool_input: { command: "git worktree list --porcelain" } });
  check("git worktree list stays allowed (hooks depend on it)", !denies(list));
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
{
  // The knowledge boundary. Project-scoped knowledge belongs in THIS repo's knowledge-base/;
  // a write into the shared store's projects/ re-forks the truth the boundary rule exists to
  // prevent. Traces to: docs/design/2026-08-03-project-local-knowledge-base.md, decision 10.
  const proj = mkdtempSync(join(tmpdir(), "phe-kb-proj-"));
  const shared = mkdtempSync(join(tmpdir(), "phe-kb-shared-"));
  mkdirSync(join(proj, ".claude"), { recursive: true });
  writeFileSync(join(proj, ".claude", "harness.json"), JSON.stringify({
    knowledge: { local: "knowledge-base", shared: { mode: "existing", path: shared }, migratedAt: "2026-08-03T00:00:00Z" },
  }));
  const intoProjects = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
    tool_input: { file_path: join(shared, "projects", "acme", "architecture.md"), content: "# Architecture\n" } });
  check("denies Write into <shared>/projects/", denies(intoProjects));
  const intoWiki = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
    tool_input: { file_path: join(shared, "wiki", "patterns.md"), content: "# Patterns\n" } });
  check("allows Write into <shared>/wiki/ (evergreen still lives there)", !denies(intoWiki));
  // projects/ is the REGISTRY: vault-scaffold/CLAUDE.md:90 mandates a row per product there.
  // Denying its _index.md would forbid the one write the folder exists for.
  const registry = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
    tool_input: { file_path: join(shared, "projects", "_index.md"), content: "| acme | ~/dev/acme | active |\n" } });
  check("allows the registry row at <shared>/projects/_index.md", !denies(registry));
  // Edit, not Write: architect-agent holds Edit and that is how it appends to an existing file.
  const editIntoProjects = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Edit",
    tool_input: { file_path: join(shared, "projects", "acme", "architecture.md"), old_string: "a", new_string: "b" } });
  check("denies an Edit into <shared>/projects/ (the deny is not Write-only)", denies(editIntoProjects));
  const noConf = mkdtempSync(join(tmpdir(), "phe-kb-noconf-"));
  const unconfigured = runHook("guard.mjs", { ...base, cwd: noConf, tool_name: "Write",
    tool_input: { file_path: join(shared, "projects", "acme", "architecture.md"), content: "# Architecture\n" } });
  check("no knowledge config -> no shared-store deny (fail open)", !denies(unconfigured));
  writeFileSync(join(proj, ".claude", "harness.json"), JSON.stringify({
    knowledge: { local: "knowledge-base", shared: { mode: "existing", path: shared }, migratedAt: null },
  }));
  const preMigration = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
    tool_input: { file_path: join(shared, "projects", "acme", "architecture.md"), content: "# Architecture\n" } });
  check("migratedAt null -> no shared-store deny (/knowledge-migrate must be able to clean up)", !denies(preMigration));
  // A path is present but the mode is not `existing` — only the mode tells this apart from a
  // configured store, so dropping the mode test leaves this the only failing check.
  writeFileSync(join(proj, ".claude", "harness.json"), JSON.stringify({
    knowledge: { local: "knowledge-base", shared: { mode: "none", path: shared }, migratedAt: "2026-08-03T00:00:00Z" },
  }));
  const modeNone = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
    tool_input: { file_path: join(shared, "projects", "acme", "architecture.md"), content: "# Architecture\n" } });
  check("shared mode none -> no shared-store deny even with migratedAt set", !denies(modeNone));
  writeFileSync(join(proj, ".claude", "harness.json"), JSON.stringify({
    knowledge: { local: "knowledge-base", shared: { mode: "existing", path: shared }, migratedAt: "2026-08-03T00:00:00Z" },
  }));

  // knowledge-base/ is git-TRACKED and the repo may be public: a secret written here is
  // PUBLISHED, not merely stored. Pointers pass; values do not.
  const secret = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
    tool_input: { file_path: join(proj, "knowledge-base", "resources.md"), content: "aws_key: AKIAIOSFODNN7EXAMPLE\n" } });
  check("denies a secret-shaped string written into knowledge-base/", denies(secret));
  const pointer = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
    tool_input: { file_path: join(proj, "knowledge-base", "resources.md"), content: "Deploy key lives in 1Password — pointer only.\n" } });
  check("allows a credentials INDEX (pointers only) in knowledge-base/", !denies(pointer));
  const elsewhere = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
    tool_input: { file_path: join(proj, "src", "config.ts"), content: "aws_key: AKIAIOSFODNN7EXAMPLE\n" } });
  check("the secret-shape scan is scoped to knowledge-base/ only", !denies(elsewhere));
  // Edit carries its payload in new_string, not content — the field the Write fixtures never reach.
  const editSecret = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Edit",
    tool_input: { file_path: join(proj, "knowledge-base", "resources.md"), old_string: "x", new_string: "aws_key: AKIAIOSFODNN7EXAMPLE\n" } });
  check("denies an Edit whose new_string carries a secret shape", denies(editSecret));
  // The blessed escape hatch, byte-for-byte the one tools/kb-check.mjs honours. A real
  // credential POINTER is shaped exactly like the thing being hunted, so without the hatch the
  // scaffold's own documented workflow is unperformable.
  const barePointer = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
    tool_input: { file_path: join(proj, "knowledge-base", "resources.md"), content: "password: 1Password/Shared-Engineering\n" } });
  check("a credential pointer that trips the regex still denies without the hatch", denies(barePointer));
  const hatched = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
    tool_input: { file_path: join(proj, "knowledge-base", "resources.md"), content: "password: 1Password/Shared-Engineering <!-- kb-check:allow -->\n" } });
  check("the <!-- kb-check:allow --> hatch waives that line (kb-check parity)", !denies(hatched));
  // The connection string is what a runbook actually records — the command that starts the
  // stack, password inline. It is not obfuscation, and it passed BOTH gates until the
  // `://user:pass@` alternative landed. knowledge-base/ is git-tracked and may be public.
  const conn = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
    tool_input: { file_path: join(proj, "knowledge-base", "runbook.md"), content: "psql postgres://app_user:Sup3rS3cretDbPass99@db.prod.internal:5432/appdb\n" } });
  check("denies a connection string carrying inline credentials", denies(conn));
  const connHatched = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
    tool_input: { file_path: join(proj, "knowledge-base", "runbook.md"), content: "psql postgres://app_user:Sup3rS3cretDbPass99@db.prod.internal:5432/appdb <!-- kb-check:allow -->\n" } });
  check("the hatch waives a connection string too", !denies(connHatched));
  // Fixing an INSTANCE is not fixing the BUG. An allowlisted username class let ONE
  // out-of-class byte walk the whole alternative, and `%40` is the mandatory percent-encoding
  // of `@` in userinfo that Azure Database for PostgreSQL/MySQL REQUIRES (`user%40servername`).
  const azure = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
    tool_input: { file_path: join(proj, "knowledge-base", "runbook.md"), content: "psql \"postgresql://acmeadmin%40acme-prod:Hq7nR2wLtV9x@acme-prod.postgres.database.azure.com:5432/appdb?sslmode=require\"\n" } });
  check("denies an Azure connection string (percent-encoded @ in the username)", denies(azure));
  // A widened regex that denies ordinary documentation gets the gate switched off by whoever
  // hits it. Two of these lines do the pinning. `team@example.com` pins the password stopping
  // at `/`; `?to=ops@acme.io` pins it stopping at `?`, and that one DENIED before the classes
  // became delimiter-scoped. The rest are green under a wider regex too — the userinfo class
  // also stops at `/` and never reaches the `:` — so they pin nothing on their own.
  const docs = runHook("guard.mjs", { ...base, cwd: proj, tool_name: "Write",
    tool_input: { file_path: join(proj, "knowledge-base", "resources.md"), content: "Docs: https://example.com/docs/x\nGrafana https://metrics.internal:3000 — owner @platform-team\nAPI https://api.example.com:443/v2/users, mail ops@example.com\nTeam page: https://example.com:8080/docs/team@example.com\nStatus page https://api.acme.io:8443?to=ops@acme.io\n" } });
  check("documentation URLs with ports and @handles still ALLOW", !denies(docs));
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
{
  // Tamper check (opt-in, stopGateTamperPaths): a RED gate snapshots gated files
  // ONCE; a later GREEN that required editing them is refused as dishonest —
  // upstream escape (coleam00/skills): handed a failing `2+2==5` test, the agent
  // rewrote the test and finished. An honest green clears the snapshot.
  const tmp = mkdtempSync(join(tmpdir(), "phe-gate-tamper-"));
  execFileSync("git", ["init", "-q", "-b", "main", tmp]);
  mkdirSync(join(tmp, ".claude"), { recursive: true });
  mkdirSync(join(tmp, "tests"), { recursive: true });
  writeFileSync(join(tmp, "tests", "a.test.js"), "assert(2 + 2 === 4)\n");
  execFileSync("git", ["-C", tmp, "add", "tests/a.test.js"]);
  execFileSync("git", ["-C", tmp, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "tests"]);
  const cfg = (exit) => JSON.stringify({ stopGate: [`node -e "process.exit(${exit})"`], stopGateTamperPaths: ["tests/"] });
  const snapPath = join(tmp, ".claude", "state", "tamper-smoke.json"); // session_id "smoke"

  writeFileSync(join(tmp, ".claude", "harness.json"), cfg(1));
  const red = runHook("stop-gate.mjs", { ...base, hook_event_name: "Stop", stop_hook_active: false, cwd: tmp });
  let redBlocked = false; try { redBlocked = JSON.parse(red.out).decision === "block"; } catch { /* non-JSON stdout: not a block */ }
  let snap = null; try { snap = JSON.parse(readFileSync(snapPath, "utf8")); } catch { /* no snapshot: the check reports it */ }
  check("red gate writes tamper snapshot of gated files", redBlocked && typeof snap?.["tests/a.test.js"] === "string");

  writeFileSync(join(tmp, "tests", "a.test.js"), "assert(2 + 2 === 5)\n"); // the dishonest edit
  writeFileSync(join(tmp, ".claude", "harness.json"), cfg(0)); // suite "goes green"
  const tampered = runHook("stop-gate.mjs", { ...base, hook_event_name: "Stop", stop_hook_active: false, cwd: tmp });
  let tBlocked = false, tReason = ""; try { const o = JSON.parse(tampered.out); tBlocked = o.decision === "block"; tReason = o.reason || ""; } catch { /* non-JSON stdout: not a block */ }
  check("green-after-gated-edit blocks and names the file", tBlocked && tReason.includes("tests/a.test.js") && existsSync(snapPath));

  writeFileSync(join(tmp, "tests", "a.test.js"), "assert(2 + 2 === 4)\n"); // revert the edit
  const honest = runHook("stop-gate.mjs", { ...base, hook_event_name: "Stop", stop_hook_active: false, cwd: tmp });
  check("honest green passes and clears the snapshot", honest.code === 0 && honest.out === "" && !existsSync(snapPath));
}
{
  // Tamper check, deletion escape: REMOVING the gated file must block the same
  // as editing it — a deleted check is a changed check, and `rm` is the cheapest
  // way to make a suite "go green" (review round 1 finding, reproduced live).
  const tmp = mkdtempSync(join(tmpdir(), "phe-gate-tamper-del-"));
  execFileSync("git", ["init", "-q", "-b", "main", tmp]);
  mkdirSync(join(tmp, ".claude"), { recursive: true });
  mkdirSync(join(tmp, "tests"), { recursive: true });
  writeFileSync(join(tmp, "tests", "a.test.js"), "assert(2 + 2 === 4)\n");
  execFileSync("git", ["-C", tmp, "add", "tests/a.test.js"]);
  execFileSync("git", ["-C", tmp, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "tests"]);
  const cfg = (exit) => JSON.stringify({ stopGate: [`node -e "process.exit(${exit})"`], stopGateTamperPaths: ["tests/"] });
  const snapPath = join(tmp, ".claude", "state", "tamper-smoke.json");
  writeFileSync(join(tmp, ".claude", "harness.json"), cfg(1));
  runHook("stop-gate.mjs", { ...base, hook_event_name: "Stop", stop_hook_active: false, cwd: tmp });
  unlinkSync(join(tmp, "tests", "a.test.js")); // delete the check outright
  writeFileSync(join(tmp, ".claude", "harness.json"), cfg(0)); // suite "goes green"
  const res = runHook("stop-gate.mjs", { ...base, hook_event_name: "Stop", stop_hook_active: false, cwd: tmp });
  let blocked = false, reason = ""; try { const o = JSON.parse(res.out); blocked = o.decision === "block"; reason = o.reason || ""; } catch { /* non-JSON stdout: not a block */ }
  check("green-after-gated-delete blocks and keeps the snapshot", blocked && reason.includes("tests/a.test.js") && existsSync(snapPath));
}
{
  // Control: without stopGateTamperPaths the gate behaves exactly as before —
  // RED then GREEN, and no tamper snapshot is ever created.
  const tmp = mkdtempSync(join(tmpdir(), "phe-gate-tamper-off-"));
  execFileSync("git", ["init", "-q", "-b", "main", tmp]);
  mkdirSync(join(tmp, ".claude"), { recursive: true });
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ stopGate: ["node -e \"process.exit(1)\""] }));
  runHook("stop-gate.mjs", { ...base, hook_event_name: "Stop", stop_hook_active: false, cwd: tmp });
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ stopGate: ["node -e \"process.exit(0)\""] }));
  const green = runHook("stop-gate.mjs", { ...base, hook_event_name: "Stop", stop_hook_active: false, cwd: tmp });
  const stateDir = join(tmp, ".claude", "state");
  const snaps = existsSync(stateDir) ? readdirSync(stateDir).filter((f) => f.startsWith("tamper-")) : [];
  check("tamper check off by default (no snapshot, green passes)", green.code === 0 && green.out === "" && snaps.length === 0);
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

// The MAXIMUM legitimate skew a bare `checkedAt` can carry, made deterministic.
//
// /models writes the user's LOCAL date; Date.parse reads a bare date as midnight UTC. So
// east of UTC a map checked "today" parses in the FUTURE, and a naive `age < 0 => stale`
// nags the user who just re-verified it. localToday() alone does NOT reliably catch that:
// the skew it produces is (local time-of-day − UTC offset), so the fixture only goes
// future-dated in the host's own timezone, before the offset hour — under TZ=UTC (i.e. on
// CI) it is future-dated NEVER, and the regression sails through green. Forcing a TZ on
// the hook does not help either: the hook's math is TZ-independent by construction.
//
// A user at UTC+14 (Kiritimati) writing their local date at 00:30 records TOMORROW's UTC
// date. Pinning that is what makes the fixture bite: it parses ahead of Date.now() by
// (24h − now's UTC time-of-day), which is > 0 at every instant, in every timezone — while
// still inside the one-day tolerance the correct guard allows. Naive guard: always stale
// (test fails). Correct guard: always fresh (test passes).
function maxSkewDate() {
  return new Date(Date.now() + 864e5).toISOString().slice(0, 10); // tomorrow, in UTC
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
  // Two stores, one boundary rule. The local KB line lands whenever `knowledge` is
  // configured (knowledge-base/ is never optional); the shared line only when a shared
  // store actually exists. No key at all -> neither line, so a pre-knowledge install is
  // quiet rather than wrong.
  const tmp = mkdtempSync(join(tmpdir(), "phe-knowledge-"));
  mkdirSync(join(tmp, ".claude"), { recursive: true });
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({
    knowledge: { local: "knowledge-base", shared: { mode: "existing", path: "/tmp/x-vault" }, migratedAt: null },
  }));
  const both = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let bothCtx = ""; try { bothCtx = JSON.parse(both.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: bothCtx stays "" and the checks fail */ }
  check("knowledge configured -> local KB line present", both.code === 0 && bothCtx.includes("Knowledge (local): knowledge-base/"));
  check("shared store configured -> shared line present", both.code === 0 && bothCtx.includes("Knowledge (shared): /tmp/x-vault"));

  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({
    knowledge: { local: "knowledge-base", shared: { mode: "none", path: null }, migratedAt: null },
  }));
  const localOnly = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let loCtx = ""; try { loCtx = JSON.parse(localOnly.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: loCtx stays "" */ }
  check("shared mode none -> local line only, no shared line", localOnly.code === 0 && loCtx.includes("Knowledge (local):") && !loCtx.includes("Knowledge (shared):"));

  // The ONLY fixture that exercises the `: "knowledge-base"` fallback at the hook's
  // `k.local` read. Without it the fallback constant could be changed to "" — emitting
  // `Knowledge (local): /` — with every other check here still green.
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ knowledge: {} }));
  const bare = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let bareCtx = ""; try { bareCtx = JSON.parse(bare.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: bareCtx stays "" */ }
  check("empty knowledge object -> local line with the default path, no shared line",
    bare.code === 0 && bareCtx.includes("Knowledge (local): knowledge-base/") && !bareCtx.includes("Knowledge (shared):"));

  // An array IS an object to typeof, and cli/knowledge-config.js's reader returns null
  // for one. The hook must agree with the reader that owns the key: no line, not a line
  // claiming a store that is not configured.
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({ knowledge: [1, 2] }));
  const arr = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let arrCtx = ""; try { arrCtx = JSON.parse(arr.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: arrCtx stays "" */ }
  check("array-valued knowledge -> no knowledge line (agrees with readKnowledgeConfig)",
    arr.code === 0 && arrCtx.includes("Stop gate:") && !arrCtx.includes("Knowledge ("));

  // The "Stop gate:" clause anchors this positively: session-start exits 0 on EVERY path,
  // so a bare `!includes` would also pass for a hook that emitted nothing at all.
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({}));
  const off = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let offCtx = ""; try { offCtx = JSON.parse(off.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: offCtx stays "" */ }
  check("no knowledge key -> no knowledge line", off.code === 0 && offCtx.includes("Stop gate:") && !offCtx.includes("Knowledge ("));
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

  // The regression guard proper (see maxSkewDate): a checkedAt at the maximum legitimate
  // timezone skew is FRESH, not stale. The fixture above only reproduces that east of UTC
  // and only before the offset hour — it passed under TZ=UTC with the bug present, which
  // is to say it passed on CI. This one is future-dated at every instant in every zone, so
  // a naive `age < 0` fails it everywhere and can no longer ship green.
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({
    stopGate: [],
    models: { checkedAt: maxSkewDate(), staleDays: 30, claude: { deep: "opus" } },
  }));
  const skew = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let skewCtx = ""; try { skewCtx = JSON.parse(skew.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout: skewCtx stays "" */ }
  check("a map at MAX timezone skew (bare date parsed ahead of now) is fresh, in every timezone",
    skew.code === 0 && !skewCtx.includes("Model map is stale"));

  // ...and the tolerance is a tolerance, not a hole: past one day, a future date is a typo
  // or a hand-edit, and must still read STALE.
  writeFileSync(join(tmp, ".claude", "harness.json"), JSON.stringify({
    stopGate: [],
    models: { checkedAt: "2099-01-01", staleDays: 30, claude: { deep: "opus" } },
  }));
  const future = runHook("session-start.mjs", { ...base, hook_event_name: "SessionStart", source: "startup", cwd: tmp });
  let futureCtx = ""; try { futureCtx = JSON.parse(future.out).hookSpecificOutput.additionalContext; } catch { /* no JSON on stdout */ }
  check("an implausibly future checkedAt is still STALE (skew tolerance is not a hole)",
    future.code === 0 && futureCtx.includes("Model map is stale"));

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
// plus `tier` — a PHE-defined cross-harness key the Codex emitter resolves to a model.
// UNVERIFIED: the docs list the supported keys but say nothing about unknown ones —
// not ignored, not rejected. This allowlist is OURS; it does not exercise Claude Code's
// parser. Re-check on upgrade (docs/99 · unverified claims).
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
    check(`${f}: frontmatter keys all in documented schema (+ PHE \`tier\`)`, m && bad.length === 0, bad.length ? `unknown: ${bad.join(", ")}` : "no frontmatter");
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
