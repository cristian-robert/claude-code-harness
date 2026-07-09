#!/usr/bin/env node
// PreToolUse guard: denies secret-file access, recursive deletes, and git
// commit/push on protected branches. Deny is carried in JSON (exit 0), per the
// hook contract; exit 2 is not used so stderr noise can never block by accident.
// Fails OPEN on any internal error — a malformed event must never brick a session.
// PreToolUse denies still fire under --dangerously-skip-permissions, which is
// what makes unattended loop runs safe.
//
// KNOWN LIMITS (by design — this is an anti-accident layer, not anti-adversary):
// commit/push detection is quote-aware (a quoted `;` can't hide it) and resolves
// git's OWN dir flags (-C/--git-dir/--work-tree, which the tracking-root design
// uses via `git -C <root>`). It does NOT parse shell cwd changes (cd, subshells)
// or variable indirection ($CMD, eval, sh -c) — those fall back to the session
// cwd (the safe default) and are the documented anti-adversary boundary: use
// permissions.deny (settings.json) + OS sandboxing for true isolation.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const SECRET_FILE = /(^|[\\/])\.env(\.[^\\/]+)?$/i;
const SECRET_OK = /\.(example|sample|template|dist|defaults)$/i;
const SECRET_EXTRA = /(^|[\\/])(id_rsa|id_ed25519|.*\.pem|credentials\.json|\.npmrc)$/i;
const SECRET_DIR = /(^|[\\/])secrets[\\/]/i; // anything under a secrets/ dir
const BASH_SECRET = /(^|[\s"'=/])\.env(\.(?!example|sample|template|dist|defaults)[\w.]+)?\b/;
const RECURSIVE_RM = /\brm\s+(-[a-z]*[rR][a-z]*f?[a-z]*|--recursive)\b|\brm\s+-[a-z]*f[a-z]*[rR]\b|\bfind\b[^|;&]*(-delete|-exec\s+rm)\b|\bgit\s+clean\b[^|;&]*-[a-z]*d/;
const PROTECTED = new Set(["main", "master"]);

// main/master are always protected; a project on a different integration base
// (develop/trunk) adds it via harness.json "baseBranch". Strictly additive.
function protectedBranches(cwd) {
  try {
    const cfg = JSON.parse(readFileSync(join(cwd, ".claude", "harness.json"), "utf8"));
    if (typeof cfg.baseBranch === "string" && cfg.baseBranch) return new Set([...PROTECTED, cfg.baseBranch]);
  } catch { /* no config: main/master only */ }
  return PROTECTED;
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

function isSecretPath(p) {
  if (!p || SECRET_OK.test(p)) return false;
  return SECRET_FILE.test(p) || SECRET_EXTRA.test(p) || SECRET_DIR.test(p);
}

function currentBranch(cwd) {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null; // empty on detached HEAD -> not a protected branch

  } catch { return null; }
}

// Split on shell separators (; && || | &) that are OUTSIDE quotes — a bounded
// tokenizer, not a full shell parser, so a quoted separator (git -c x="a;b")
// can't hide a later commit/push or fake a segment boundary.
function splitTopLevel(cmd) {
  const out = []; let cur = "", q = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === ";" || c === "&" || c === "|") {
      out.push(cur); cur = "";
      if ((c === "&" && cmd[i + 1] === "&") || (c === "|" && cmd[i + 1] === "|")) i++;
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}
// Quote-aware word split of one segment: strips quotes, keeps quoted spaces.
function tokenize(s) {
  const toks = []; let cur = "", q = null, has = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; else cur += c; has = true; continue; }
    if (c === '"' || c === "'") { q = c; has = true; continue; }
    if (/\s/.test(c)) { if (has) { toks.push(cur); cur = ""; has = false; } continue; }
    cur += c; has = true;
  }
  if (has) toks.push(cur);
  return toks;
}

// Parse a git invocation: walk the GLOBAL options (capturing -C/--git-dir/
// --work-tree, space OR = form) until the first bareword — the SUBCOMMAND. So
// `git log --grep=commit` reads subcommand `log` (not a mutation, not blocked),
// and `git --git-dir /x/.git commit` resolves its dir. Returns {sub, dir}|null.
// Shell cwd changes (cd/subshells) and variable indirection are NOT parsed —
// dir falls back to the session cwd (safe default). That is the documented
// anti-adversary boundary: permissions.deny + OS sandbox for true isolation.
const OPT_WITH_VALUE = /^(-c|--namespace|--exec-path|--super-prefix|--config-env)$/;
function gitParse(seg, baseCwd) {
  const toks = tokenize(seg);
  const gi = toks.findIndex((t) => t === "git" || t.endsWith("/git"));
  if (gi < 0) return null;
  let dir = baseCwd, sub = null, m;
  for (let i = gi + 1; i < toks.length; i++) {
    const t = toks[i];
    if (!t.startsWith("-")) { sub = t; break; } // first bareword = subcommand
    if (t === "-C" && toks[i + 1] != null) dir = resolve(baseCwd, toks[++i]);
    else if (t === "--work-tree" && toks[i + 1] != null) dir = resolve(baseCwd, toks[++i]);
    else if (t === "--git-dir" && toks[i + 1] != null) dir = resolve(baseCwd, toks[++i].replace(/\/\.git\/?$/, ""));
    else if ((m = t.match(/^--work-tree=(.+)$/))) dir = resolve(baseCwd, m[1]);
    else if ((m = t.match(/^--git-dir=(.+)$/))) dir = resolve(baseCwd, m[1].replace(/\/\.git\/?$/, ""));
    else if ((m = t.match(/^-C(.+)$/))) dir = resolve(baseCwd, m[1]);
    else if (OPT_WITH_VALUE.test(t) && toks[i + 1] != null) i++; // skip this option's value
    // other bare flags (-p, --bare, --no-pager…) take no value
  }
  return { sub, dir };
}

// EVERY git commit/push in the command (each top-level segment), with its dir.
function gitMutations(cmd, baseCwd) {
  const out = [];
  for (const seg of splitTopLevel(cmd)) {
    const p = gitParse(seg, baseCwd);
    if (p && (p.sub === "commit" || p.sub === "push")) out.push({ dir: p.dir, isPush: p.sub === "push" });
  }
  return out;
}

async function main() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const event = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const tool = event.tool_name || "";
  const input = event.tool_input || {};

  if (["Read", "Edit", "Write", "NotebookEdit"].includes(tool)) {
    if (isSecretPath(input.file_path)) {
      deny(`Access to secret file '${input.file_path}' is blocked. Use .env.example for structure; ask the user to handle real secret values themselves.`);
    }
  }

  if (tool === "Glob" || tool === "Grep") {
    const target = `${input.pattern || ""} ${input.path || ""}`;
    if (BASH_SECRET.test(target)) {
      deny("Searching secret files (.env*) is blocked. Use .env.example instead.");
    }
  }

  if (tool === "Bash") {
    const cmd = String(input.command || "");
    // Secret/key-file protection, parity with the Read/Edit/Write branch. Scan
    // EVERY path-like fragment of the command — split on all shell/quoting
    // punctuation — so quoting, command/process substitution ($(…), <(…), `…`),
    // redirects, and interpreter wrapping (`sh -c "…"`, `python -c "…"`) cannot
    // hide a literal secret path. `.env.example` and friends stay allowed via
    // SECRET_OK. This intentionally ALSO denies a secret filename that appears
    // only as prose (e.g. a commit message "rotate server.pem"): a rare,
    // fail-safe false positive, matching how the prior .env-only guard behaved.
    // It is NOT a defense against adversarial obfuscation — variable indirection
    // ($VAR), eval, and base64 can't be resolved statically and remain the
    // documented anti-adversary boundary (use permissions.deny + OS sandboxing
    // for true isolation).
    for (const frag of cmd.split(/[^\w./~\\-]+/)) {
      if (frag && isSecretPath(frag)) {
        deny(`This command references a secret/key file ('${frag}'), which is blocked. Use .env.example or a non-secret path; the user manages real secret values.`);
      }
    }
    if (RECURSIVE_RM.test(cmd)) {
      deny("Recursive/forced deletion is blocked by the harness guard. Delete specific files explicitly, or ask the user to run this themselves.");
    }
    const baseCwd = event.cwd || process.cwd();
    for (const gm of gitMutations(cmd, baseCwd)) { // deny() exits on the first violation
      const gitCwd = gm.dir; // the repo THIS commit/push really targets
      const branch = currentBranch(gitCwd);
      if (branch && protectedBranches(gitCwd).has(branch)) {
        // Narrow exception: tracking-only commits (work-item state) are allowed on
        // any branch — backlog/ + sprints/ live in the primary checkout by design
        // (the tracking root, see references/work-tracking.md). Code stays blocked.
        const trackingOnly = !gm.isPush && (() => {
          try {
            const staged = execFileSync("git", ["diff", "--cached", "--name-only"], {
              cwd: gitCwd, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"],
            }).trim().split("\n").filter(Boolean);
            return staged.length > 0 && staged.every((f) => f.startsWith("backlog/") || f.startsWith("sprints/"));
          } catch { return false; }
        })();
        if (!trackingOnly) {
          deny(`git ${gm.isPush ? "push" : "commit"} on '${branch}' is blocked (code never lands on ${branch} directly). Create a feature branch first ({type}/{description}). Exception: commits staging ONLY backlog/ or sprints/ files (tracking state) are allowed.`);
        }
      }
      // Opt-in evolve->push gate (harness.json: "requireEvolveBeforePush": true):
      // push is denied until /evolve has run since the last commit — the marker
      // .claude/state/.evolve-ran must be newer than HEAD's commit time.
      if (gm.isPush) {
        try {
          const cfg = JSON.parse(readFileSync(join(gitCwd, ".claude", "harness.json"), "utf8"));
          if (cfg.requireEvolveBeforePush === true) {
            const headSec = Number(execFileSync("git", ["log", "-1", "--format=%ct"], {
              cwd: gitCwd, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"],
            }).trim());
            let fresh = false;
            try { fresh = statSync(join(gitCwd, ".claude", "state", ".evolve-ran")).mtimeMs >= headSec * 1000; } catch { /* no marker */ }
            if (!fresh) deny("Push blocked: /evolve has not run since the last commit (harness.json requireEvolveBeforePush). Run /evolve — capturing or explicitly declining learnings — then push.");
          }
        } catch { /* no config / no git: gate not armed — fail open */ }
      }
    }
  }

  process.exit(0);
}

main().catch(() => process.exit(0)); // fail open: guard must never brick the session
