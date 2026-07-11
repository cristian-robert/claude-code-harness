# Harness Maintenance

Read this BEFORE modifying anything under `.claude/` or `CLAUDE.md`. The harness is load-bearing: a wrong frontmatter key or a bloated rule fails silently.

## 1. Map — what lives where

| Piece | Path | Role |
|---|---|---|
| Root memory | `CLAUDE.md` | Always loaded: commands, pipeline, hard rules, pointers |
| Always-on rules | `.claude/rules/*.md` without `paths:` | Load every session, same priority as CLAUDE.md |
| Path-scoped rules | `.claude/rules/*.md` with `paths:` frontmatter | Load only when Claude reads a matching file |
| Subdir memory | `<dir>/CLAUDE.md` | Lazy-loads when a file in `<dir>` is first read |
| References | `.claude/references/*.md` | Load ONLY when a rule/skill cites them — never preload |
| Skills | `.claude/skills/<name>/SKILL.md` | Pipeline commands (`/plan`…`/evolve`); `disable-model-invocation: true` |
| Agents | `.claude/agents/*.md` | Subagent definitions; dispatches pass `model:` explicitly |
| Hooks | `.claude/hooks/*.mjs` | Deterministic enforcement; wired in `.claude/settings.json` |
| Gate config | `.claude/harness.json` | `stopGate` commands run by `stop-gate.mjs` |
| Session state | `.claude/state/` | Machine state — `compact-snapshot.md`, `last-gate.json`; adopters gitignore it |
| Statusline | `.claude/statusline.mjs` | Renders the one-line session status (`statusLine` in settings.json) — display only, never blocks |
| Output contract | `.claude/references/output-contract.md` | The final-line format + Forbidden list every pipeline skill follows — cite it when authoring or editing any skill |
| Artifacts | `plans/`, `reports/` | Pipeline outputs on disk, not terminal recaps |

Guidance (advisory) lives in CLAUDE.md/rules; enforcement (deterministic) lives in hooks + permission rules. Never encode a hard rule as prose only.

## 2. Platform contract (exact — violations fail silently)

| Contract | Detail |
|---|---|
| Hook input | JSON on STDIN, never argv. Parse stdin for `hook_event_name`, `tool_name`, `tool_input`, `cwd` |
| PreToolUse deny | exit 0 + `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"…"}}` |
| Stop block | exit 0 + top-level `{"decision":"block","reason":"…"}`. MUST exit 0 early when `stop_hook_active` is true (platform force-stops after 8 consecutive blocks) |
| Exit 2 | Blocks via the stderr message. Never mix: JSON stdout is IGNORED on exit 2. Pick exit 0 + JSON or exit 2 + stderr |
| Bypass mode | PreToolUse `deny` fires even under `--dangerously-skip-permissions`; but a hook `allow` NEVER overrides a settings `deny` rule |
| Parallel hooks | All matching hooks run to completion in parallel; most restrictive decision wins: deny > defer > ask > allow |
| Rule scoping | `paths:` frontmatter only. `globs:` is silently ignored — the rule then loads ALWAYS. This exact bug once loaded every rule in every session: a 4x invisible context tax |
| Unscoped rules | No `paths:` = loads always. Make that a deliberate choice, not a default |
| Subdir CLAUDE.md | Lazy-loads on first read in that dir; NOT re-injected after compaction until the next read there. Root CLAUDE.md does survive compaction |

## 3. Change protocol

| Changing… | Do |
|---|---|
| Any hook | Edit, then ALWAYS `node .claude/hooks/smoke-test.mjs`. New behavior → add a fixture first. A silently broken hook is worse than none |
| settings.json wiring | Same smoke test; verify the `matcher` against the exact tool name used |
| CLAUDE.md / rules | Ratchet: every new line cites a real incident. No speculative rules |
| Adding a rule | Check budgets below; over budget → cut a weaker line to make room |
| harness.json stopGate | Commands must be fast (<30s) and deterministic; a flaky gate risks a block loop |

After any change to always-loaded content: `node tools/context-ledger.mjs` (framework repo) to re-check the always-loaded token tax.

## Skill `allowed-tools` syntax

Verified against code.claude.com/docs/en/skills §6.10: SPACE-separated, `Bash(<cmd> *)` (e.g. `allowed-tools: Bash(git add *) Bash(git commit *)`) — NOT colon/comma form. Re-verify on platform upgrades; a wrong form silently grants nothing (the `!`-injected blocks then hit a prompt or come up empty).

## 4. Budgets (hard)

| File | Budget |
|---|---|
| `CLAUDE.md` | ~60 lines |
| Each rule | <=45 lines |
| Skill body | <=100 lines |
| Context/knowledge skill body | <=70 lines |
| Reference | <=160 lines |
| Subdirectory CLAUDE.md | <=30 lines |
| This file | <=120 lines |

Skill `description:` <=40 words — it always loads in the skill listing unless the skill is `disable-model-invocation: true`.

Why: context rot — recall degrades as context grows; every always-loaded token dilutes attention on the actual task. Test per line: "would removing this cause a mistake?" If not, cut.

## 5. Pruning

- Re-review ALL always-loaded content on every model upgrade — newer models need fewer guardrails; stale rules are pure tax.
- Ablate one component at a time: remove it, run a real task, watch for regressions. Never bulk-delete.
- "Harnesses don't shrink, they move": demote in order always-loaded → `paths:`-scoped → reference → deleted.

## 6. Failure modes

| Symptom | Likely harness cause |
|---|---|
| Rule ignored | File too long or ambiguous — memory is context, not config. Shorten, sharpen, or promote to a hook |
| Hook never fires | Reads argv instead of stdin; wrong `matcher`; not registered in settings.json |
| Stop gate loops forever | `stop_hook_active` not honored — must exit 0 when it is true |
| Context bloat every session | Unscoped rules that should be `paths:`-scoped, or the `globs:` typo defeating scoping |
| Hook blocks but Claude sees no reason | Exit 2 with JSON on stdout (ignored) — reason goes in stderr, or use exit 0 + JSON |
| Subdir conventions forgotten mid-session | Compaction dropped subdir CLAUDE.md; reloads on next read there — promote critical lines to a scoped rule |
| Knowledge skill never fires | Description not pushy, or delisted by the ~1%-of-window listing budget trim (least-used dropped first) — sharpen the description; check `skillOverrides` + the skill listing budget |
| Reviewer verdict malformed | `verdict-gate.mjs` SubagentStop hook re-prompts via exit 2 — if verdicts still slip through, check its matcher and smoke fixtures |

## 7. Load conditions

Every "load when" cell (CLAUDE.md context table, rule reference citations, skill phase tables) uses one of these forms. Narrative "load when relevant" is FORBIDDEN — a non-condition.

| Form | Example |
|---|---|
| always | `always` |
| task-shaped | `any export work (CSV/PDF/XLSX)` — name the operation |
| diff-driven | `<glob> files in diff` |
| plan-driven | `plan frontmatter complexity: M+` |
| argument-driven | `invocation argument contains <token>` |

Combine with `+` (AND) or `,` (OR), two clauses max — more logic belongs inside the loaded file.

## 8. Skill growth

Skill body over its 100-line budget → don't trim lossily; convert to a phase-table router: header + Args + Output + a Phases table (`# | Phase | Reference | Load condition`), per-phase load conditions from section 7, detail relocated to `references/<skill>/NN-phase.md` files. Relocate, don't delete.
