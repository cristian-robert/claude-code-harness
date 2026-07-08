# 02 · Enforcement vs Guidance

## The split

CLAUDE.md and rules are "context, not enforced configuration" (Anthropic docs, verbatim).
The model weighs them against everything else in the window and may drop them — odds rise
as sessions lengthen and attention degrades. Hooks and permission rules are a different
kind of thing: they execute outside the model, regardless of what it decides. Guidance
shapes behavior; enforcement bounds it. Pick the mechanism by consequence:

| Requirement | Mechanism |
|---|---|
| Must NEVER happen | `permissions.deny` AND a PreToolUse hook — defense in depth, both layers |
| Must ALWAYS happen at a lifecycle point | Hook on that event (Stop gate, SessionStart orientation) |
| Should usually happen | CLAUDE.md line or unscoped rule |
| Workflow with steps | Skill |
| Place-specific | Subdirectory CLAUDE.md (loads on file access there) |
| File-type-specific | `paths:`-scoped rule |

## The PHE enforcement set

Wiring: `template/.claude/settings.json`. Scripts: `template/.claude/hooks/`.

| Layer | Event · matcher | Does | Mode | Traces to |
|---|---|---|---|---|
| `permissions.deny` | — | Denies `Read(./.env)`, `Read(./.env.*)`, `Read(./secrets/**)`, `Read(**/*.pem)` | Blocking | Agent read `.env`, echoed keys into a transcript |
| `guard.mjs` | PreToolUse · `Bash\|Read\|Edit\|Write\|NotebookEdit\|Glob\|Grep` | Denies secret-file access (incl. Bash indirection), recursive deletes (`rm -rf`, `find -delete`, `git clean -d`), commit/push on `main`/`master` (sole exception: tracking-only commits staging just `backlog/`/`sprints/`) + opt-in evolve→push gate | Blocking — JSON deny, exit 0 | Same secrets incident; deleted working tree; direct commit to main |
| `post-edit.mjs` | PostToolUse · `Edit\|Write\|NotebookEdit` | Cheapest available checker for the touched file type; an edit under `.claude/hooks/` additionally runs `smoke-test.mjs` (advisory-but-automatic — the "hooks change → smoke test" rule as mechanism, not prose); findings return via `additionalContext` | Advisory — always exit 0 | Lint drift surfacing only at gate time; hook edits shipped untested despite the prose rule |
| `stop-gate.mjs` | Stop · (no matcher) | Runs `stopGate` commands from `.claude/harness.json`; blocks turn end until green; honors `stop_hook_active`; persists the verdict to `.claude/state/last-gate.json` for the pre-compact snapshot | Blocking — `decision: "block"` | "Done" claimed with failing tests |
| `session-start.mjs` | SessionStart | Injects branch/dirty state, latest plan, gate config; on `source=compact` re-injects the compact snapshot + a Tier-1-loss warning | Advisory context | Every fresh session re-explored repo state |
| `pre-compact.mjs` | PreCompact · (no matcher — fires on `manual` and `auto`) | Snapshots branch, dirty files, active plan, latest report, last gate verdict → `.claude/state/compact-snapshot.md` | Advisory — side-effect only, NEVER blocks compaction (a failed snapshot must not strand a full window) | Compaction laundered a RED gate verdict and dropped the active-plan pointer |
| `verdict-gate.mjs` | SubagentStop · `code-reviewer` | Requires the reviewer's first line to be exactly `PASS` or `REQUEST_CHANGES`; on violation, stderr re-prompts the reviewer to re-emit its verdict | Blocking — exit 2 + stderr | Reviewer ignored the verdict contract; a prose first line broke `/review`'s parser |

`.claude/state/` is per-repo runtime state (snapshots, gate verdicts) — adopters gitignore
it (`/harness-init` does this during setup).

**Layered `.env` defense — both directions of the asymmetry, precisely:**

1. A settings `deny` rule beats hook approvals: if a deny rule matches, the call is blocked
   even when a hook returns `allow` — from any settings scope, including managed.
2. A PreToolUse hook `deny` fires **before** the permission-mode check: it blocks even under
   `bypassPermissions` / `--dangerously-skip-permissions`. This is what makes unattended
   loop runs safe.

Neither layer can override the other's deny. Each covers the other's blind spot — a
misfiring hook `allow` can't expose secrets, and mode escalation can't either. Keep both.

## Hook engineering rules (each learned the hard way)

| Rule | Contract | Incident |
|---|---|---|
| Read stdin JSON, never argv | Hook input arrives as one JSON object on stdin | Two hooks shipped parsing `process.argv`: got nothing, allowed everything — inert, and invisible because failure looked like success |
| Deny via JSON + exit 0; exit 2 only for stderr blocking; never mix | "Claude Code ignores JSON when you exit 2" | A guard emitted a JSON deny AND exited 2 — the structured reason was silently discarded |
| Honor `stop_hook_active` | Stop input carries it; platform also force-ends the turn after 8 consecutive blocks (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`) | A gate re-blocked its own continuation, burning turns to the cap |
| Fail OPEN on internal errors | try/catch everything → exit 0 | Early guard threw on events lacking `tool_input`, spraying hook errors onto every tool call — a malformed event must never brick a session |
| Design for parallel siblings | Same-event hooks all run to completion in parallel; most restrictive decision wins (`deny > defer > ask > allow`); with multiple `updatedInput`s, last-to-finish wins — nondeterministic | Two hooks rewriting the same tool's input raced; one silently lost |
| Smoke-test after every change | `node .claude/hooks/smoke-test.mjs`; new fixture per new behavior | One fixture would have caught the argv hooks on day one |
| Keep the Stop gate CHEAP | Seconds — lint + unit. Stop fires on EVERY response, not just task completion. The full gate is `/validate` | An e2e suite in `stopGate` added minutes to every turn end |
| Output-mutating automation ships opt-in | Auto-format/auto-fix rewrites files under the model | A formatter hook changed a file mid-edit-sequence; subsequent `Edit` old_string mismatches cascaded |

## Escalation ladder

An incident lands in `/evolve`, which picks the **lowest rung that would have prevented
it** and promotes only on recurrence:

convention (CLAUDE.md line) → rule (unscoped or `paths:`-scoped) → hook / `permissions.deny`

| Incident | Rung chosen | Why |
|---|---|---|
| Claude read `.env` | Hook + deny rule — top rung immediately | Irreversible-harm class never starts at convention |
| Claude used raw hex colors, not design tokens | `paths:`-scoped frontend rule | Usually wrong, but exceptions need judgment |
| Claude claimed done without running tests | `stopGate` entry in `harness.json` | Must always happen at turn end; mechanically checkable |
| Reviewer ignored the verdict contract | SubagentStop hook (`verdict-gate.mjs`) | First-line format is mechanically checkable; exit 2 re-prompts the agent itself — guidance→enforcement applied to the review loop |

The ladder also runs down: when a model upgrade extinguishes a failure class, demote the
hook to a rule, then out — verify with the incident log before pruning, not vibes.

## When NOT to hook

- **Judgment calls.** Hooks verify mechanically checkable invariants — exit codes, path
  matches, patterns. "Is this abstraction premature" cannot exit 2.
- **Anything needing project context a script can't have.** "Is this endpoint public API?"
  is a rule-plus-reviewer question, not a regex.
- **Style preferences.** A blocking style hook trains workarounds; taste belongs to
  `/review` (superpowers:requesting-code-review).
- Every hook is latency on every matching event, forever. It pays rent or it goes.

## Sources

- Claude Code docs — hooks reference + hooks guide (exit-code semantics, JSON schemas,
  parallel merge, Stop block cap, permission precedence); memory page ("context, not
  enforced configuration")
- Anthropic — "Harness design for long-running application development" (deterministic
  gates, generator/evaluator split)
- AIDF v0.8 — gate + ledger lineage; the `globs:` frontmatter incident behind "platform
  claims get verified"
- Cole Medin — harness-engineering-demo (guard/gate hook pattern)
