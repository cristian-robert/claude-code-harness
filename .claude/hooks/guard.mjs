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
import { readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const SECRET_FILE = /(^|[\\/])\.env(\.[^\\/]+)?$/i;
const SECRET_OK = /\.(example|sample|template|dist|defaults)$/i;
const SECRET_EXTRA = /(^|[\\/])(id_rsa|id_ed25519|.*\.pem|credentials\.json|\.npmrc|\.netrc)$|(^|[\\/])\.aws[\\/]credentials$|(^|[\\/])\.ssh[\\/]/i;
const SECRET_DIR = /(^|[\\/])secrets[\\/]/i; // anything under a secrets/ dir
const BASH_SECRET = /(^|[\s"'=/])\.env(\.(?!example|sample|template|dist|defaults)[\w.]+)?\b/;
// Environment dumps ARE secret reads: blocking the .env FILE but not `printenv`
// guards one door of two — the same values sit in the process environment
// (coleam00/skills audit, 2026-09-01). `env FOO=1 cmd` stays allowed; only a
// BARE env (piped/redirected/terminal) is a dump. Multiline edge: (^|[;&|]\s*)
// anchors to command separators, not line starts — an `env` alone on a later
// line of a multiline command is missed; accepted, same anti-adversary boundary.
const ENV_DUMP = [
  /(^|[;&|]\s*)printenv\b/,
  /(^|[;&|]\s*)env\s*(\||>|$)/,
  /\becho\b[^;&|]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)\w*/i,
  /\/proc\/(self|\d+)\/environ\b/,
];
// Inline-interpreter env dump: two independent conditions, because the code
// argument may carry ; & | inside quotes (a single spanning regex misses
// `python3 -c 'import os; print(os.environ)'`). A grep FOR these tokens has no
// inline-interpreter flag and stays allowed. Fail-safe over precise.
const INLINE_INTERP = /\b(node\s+(-e|-p|--eval|--print)|python3?\s+-c|ruby\s+-e|perl\s+-e)\b/;
const ENV_TOKEN = /(process\.env|os\.environ|ENV\[)/;
const RECURSIVE_RM = /\brm\s+(-[a-z]*[rR][a-z]*f?[a-z]*|--recursive)\b|\brm\s+-[a-z]*f[a-z]*[rR]\b|\bfind\b[^|;&]*(-delete|-exec\s+rm)\b|\bgit\s+clean\b[^|;&]*-[a-z]*d/;
const PROTECTED = new Set(["main", "master"]);
// knowledge-base/ is git-TRACKED, and a harnessed repo may be public: a credential written
// there is PUBLISHED, not merely stored. Modelled on BASH_SECRET above — shape detection,
// not entropy. Duplicated (not imported) in tools/kb-check.mjs on purpose: hooks are copied
// standalone into adopter repos and must stay dependency-free. Keep the two in sync — this
// blocks the WRITE, kb-check blocks the COMMIT. The `://user:pass@` alternative is the
// connection-string form. Both halves are DELIMITER-scoped, never allowlists: an allowlisted
// username class missed `user%40server`, the percent-encoded `@` Azure Database REQUIRES, and
// one out-of-class byte defeated the whole alternative. The password stops at the URL
// delimiters `/ ? # \` and whitespace, so a later `@` in a path or query string is not a false
// positive; the cost is a password CONTAINING one of those, and placeholder templates that
// now deny — waive a line with `<!-- kb-check:allow -->`.
const KB_SECRET = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-(?:proj|ant|[a-z]{2,8})-[A-Za-z0-9_\-]{20,}|\bsk-[A-Za-z0-9]{20,}|\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bxox[abprs]-[A-Za-z0-9-]{20,}|\bAIza[A-Za-z0-9_\-]{35}\b|\bAKIA[0-9A-Z]{16}\b|\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}|:\/\/[^\s:\/?#@]*:[^@\s\/?#\\]{8,}@|(?:password|passwd|api[_-]?key|secret|token)[A-Za-z0-9_.\-]*\s*[:=]\s*["']?[A-Za-z0-9_\-+/]{12,})/i;

// main/master are always protected; a project on a different integration base
// (develop/trunk) adds it via harness.json "baseBranch". Strictly additive.
function protectedBranches(cwd) {
  try {
    const cfg = JSON.parse(readFileSync(join(cwd, ".claude", "harness.json"), "utf8"));
    if (typeof cfg.baseBranch === "string" && cfg.baseBranch) return new Set([...PROTECTED, cfg.baseBranch]);
  } catch { /* no config: main/master only */ }
  return PROTECTED;
}

// The shared knowledge store (an Obsidian vault) if one is configured AND the
// one-way migration out of it has already happened. Only `existing` + a non-null
// `migratedAt` counts: before the migration, /knowledge-migrate itself has to
// write into <shared>/projects/ to clean it up (spec: deny "after migration").
function sharedStorePath(cwd) {
  try {
    const cfg = JSON.parse(readFileSync(join(cwd, ".claude", "harness.json"), "utf8"));
    const k = cfg.knowledge;
    if (!k || !k.migratedAt) return null;
    const s = k.shared;
    if (s && s.mode === "existing" && typeof s.path === "string" && s.path) return resolve(s.path);
  } catch { /* no config / unreadable: no shared store to protect — fail open */ }
  return null;
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

  // The knowledge boundary (two stores, one rule). Project-scoped knowledge lives in THIS
  // repo's knowledge-base/; the shared vault keeps evergreen wiki/ + agent-kb/ only.
  // Reads are untouched — this blocks the two WRITES that would re-fork the truth.
  if (["Edit", "Write", "NotebookEdit"].includes(tool) && input.file_path) {
    const kbCwd = event.cwd || process.cwd();
    const target = resolve(kbCwd, input.file_path);
    const shared = sharedStorePath(kbCwd);
    // projects/_index.md is the REGISTRY — one row per product, repo path and status, not
    // knowledge — and the vault's own doctrine mandates that row. Denying it would forbid the
    // one write the folder still exists for. Everything ELSE under projects/ is the fork.
    if (shared && (target + "/").startsWith(shared + "/projects/")
        && target !== resolve(shared, "projects", "_index.md")) {
      deny(`'${input.file_path}' is inside the shared store's projects/ — project-scoped knowledge lives in this repo's knowledge-base/ instead. Promotion MOVES a fact to the shared store; nothing is ever kept in both. Only projects/_index.md (the registry row) stays writable. See .claude/references/knowledge-protocol.md.`);
    }
    if ((target + "/").startsWith(resolve(kbCwd, "knowledge-base") + "/")) {
      // Line-wise, and a line carrying the <!-- kb-check:allow --> hatch is waived — the same
      // escape hatch tools/kb-check.mjs honours, for the same reason: a credential POINTER
      // ("password: 1Password/Shared-Engineering") is shaped exactly like the thing being
      // hunted, and resources.md exists to hold pointers. A whole-body test made the
      // scaffold's own documented waiver unreachable.
      const body = `${input.content || ""}\n${input.new_string || ""}`;
      for (const line of body.split("\n")) {
        if (line.indexOf("<!-- kb-check:allow -->") !== -1) continue;
        if (KB_SECRET.test(line)) {
          deny("This write puts a secret-shaped string into knowledge-base/, which is git-tracked and may be published. Record a POINTER to where the credential lives (1Password, the platform's secret manager) — never the value. A pointer that itself looks secret-shaped is waived one line at a time with a trailing <!-- kb-check:allow -->. See .claude/references/knowledge-protocol.md.");
        }
      }
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
    // Scanned twice: as written, and with quotes folded away — a shell resolves
    // cat .e'nv' and cat .env to the same path, but the fragment split above
    // breaks on the quote and reassembles nothing (measured bypass upstream).
    const folded = cmd.replace(/["']/g, "").replace(/\s+/g, " ");
    for (const source of [cmd, folded]) {
      for (const frag of source.split(/[^\w./~\\-]+/)) {
        if (frag && isSecretPath(frag)) {
          deny(`This command references a secret/key file ('${frag}'), which is blocked. Use .env.example or a non-secret path; the user manages real secret values.`);
        }
      }
    }
    if (ENV_DUMP.some((p) => p.test(cmd)) || (INLINE_INTERP.test(cmd) && ENV_TOKEN.test(cmd))) {
      deny("This command dumps the process environment (printenv / bare env / echo of a secret-named variable / inline interpreter reading process.env, os.environ), which exposes the same values as reading .env. Use .env.example for structure; the user manages real secret values.");
    }
    if (RECURSIVE_RM.test(cmd)) {
      deny("Recursive/forced deletion is blocked by the harness guard. Delete specific files explicitly, or ask the user to run this themselves.");
    }
    const baseCwd = event.cwd || process.cwd();
    // Worktrees stay INSIDE the project root. A worktree added as a SIBLING of the
    // repo (../wt-x) makes a folder appear outside the project — invisible in the
    // user's IDE, indistinguishable from the agent roaming their filesystem.
    // Traces to: /implement's old ../wt-<slug> convention, 2026-07-14 incident.
    for (const seg of splitTopLevel(cmd)) {
      const p = gitParse(seg, baseCwd);
      if (!p || p.sub !== "worktree") continue;
      const toks = tokenize(seg);
      const wi = toks.indexOf("worktree");
      if (wi < 0 || toks[wi + 1] !== "add") continue;
      let wtPath = null; // first non-flag token after "add" = <path>; -b/-B take a value
      for (let i = wi + 2; i < toks.length; i++) {
        const t = toks[i];
        if (t === "-b" || t === "-B") { i++; continue; }
        if (t.startsWith("-")) continue;
        wtPath = t; break;
      }
      if (!wtPath) continue;
      try {
        // Physical paths on both sides: rev-parse returns the symlink-resolved
        // toplevel (macOS /tmp -> /private/tmp), so the base must match it.
        const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
          cwd: p.dir, encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        let physDir = p.dir;
        try { physDir = realpathSync(p.dir); } catch { /* vanished dir: keep logical path */ }
        if (top && !(resolve(physDir, wtPath) + "/").startsWith(top + "/")) {
          deny(`git worktree add outside the project root ('${wtPath}') is blocked — a folder appearing next to the repo surprises the user. Use .worktrees/<slug> INSIDE the repo, kept out of status via: git check-ignore -q .worktrees || echo '.worktrees/' >> "$(git rev-parse --git-common-dir)/info/exclude"`);
        }
      } catch { /* not a git repo: nothing to protect — fail open */ }
    }
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
      // Evolve->push gate (harness.json: "requireEvolveBeforePush", default true; false opts out):
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
