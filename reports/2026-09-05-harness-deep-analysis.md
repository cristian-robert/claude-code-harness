# Harness deep analysis — 2026-09-05

Scope: how the shipped harness (`template/`) shapes the user–Claude Code interaction for software development. Six lenses: agent/subagent context, behaviour under load, skills, context preservation, hallucination vectors, and development effectiveness. Findings are ranked inside each lens; the roadmap at the end ranks across lenses.

## Method and evidence base

- **Read in full:** all 6 hooks + `settings.json`, the 9 pipeline skills, 5 agents, 6 references, `docs/00–06`, `docs/99`, the two prior adversarial reviews (2026-08-29, 2026-08-30), the code-reviewer's persistent memory, the vault's `agent-kb/` and `wiki/` failure-mode notes.
- **Platform contract re-verified against raw sources today:** `code.claude.com/docs/en/hooks.md` (raw, 317 KB), memory, sub-agents, skills, context-window, how-claude-code-works, best-practices; the Claude Code CHANGELOG from 2.1.243 to 2.1.261.
- **Field research:** Anthropic "Harness design for long-running apps"; arXiv 2604.25850 (observability-driven harness evolution: Terminal-Bench 69.7→77.0%, gains concentrated in tools, middleware and memory, not the system prompt); arXiv 2602.14690 (2,853 repos: context files dominate, skills mostly static, AGENTS.md emerging as the standard); arXiv 2603.20432 (coding agents beat long-context prompting by 17.3% by externalising text into files and tools); Chroma context-rot (every one of 18 models degrades with length; a 200K model shows it at 50K); Osmani "Agent Harness Engineering".
- **Session evidence:** this session's own behaviour, quoted where it is the incident.

Where the harness stands: enforcement is real and tested (135 hook fixtures, fail-open, tamper check), the generator/evaluator split is wired, artifacts live on disk, the ratchet and prune loop exists, and a ledger measures the always-loaded tax. That puts it well ahead of the 2,853-repo median, which uses context files only. Every finding below is about the next layer, not the foundation.

## 1. Agent and subagent context

**1.1 What a subagent actually sees (verified).** A non-fork subagent gets a shorter system prompt, the delegation message, its agent file, and nothing else: no conversation history, no auto memory (only forks inherit it), no CLAUDE.md for built-in Explore. The harness's four-element brief and "self-containment" rules are therefore load-bearing, not ceremony. Keep them.

**1.2 The reviewer-independence rule is now half-stale.** `dispatch-protocol.md` (verified 2026-07-12) says `CLAUDE_CODE_SUBAGENT_MODEL` sits above the per-invocation model and silently defeats sibling review. In 2.1.251 the semantics flipped: the env var now sets the *default* and an agent's `model:` or a per-spawn model wins. In 2.1.257 a new `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` restores the override-everything behaviour. So the warning names the wrong variable. Fix the reference and `docs/99` source 3, and add one `session-start.mjs` line: if `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is set, print "sibling review is dead this session". Hook change, so one fixture. *Trace: changelog 2.1.251, 2.1.257.*

**1.3 `maxTurns` needs Claude Code ≥ 2.1.246.** `scout` (25), `qa-evaluator` (50) and `research-gatherer` (20) rely on it; on older versions it is silently ignored and a scout can grind indefinitely. State a minimum Claude Code version in README and have `/harness-init` step 4 record `claude --version`. *Trace: sub-agents reference.*

**1.4 The reviewer can still run on the author's model.** `code-reviewer` has no `model:` by design; if a dispatcher omits the pin, resolution falls to the session model and the prose "say so and stop" is the only defence. Hooks never receive the subagent's model, so this cannot be enforced today. Record it as a known prose-only invariant so nobody assumes a hook covers it.

**1.5 New primitives worth an ablation, not adoption by default.** `skills:` preload (full skill body injected at subagent start), `Agent(a, b)` to restrict which subagents an agent may spawn, `isolation: worktree`, `SubagentStart` hooks with `additionalContext`, and the bundled `/verify` skill that drives the running app. `/verify` overlaps `qa-evaluator`; the ratchet says test whether the custom agent still earns its place before the next model upgrade.

## 2. Behaviour under load

**2.1 Give the handoff rule a number, in tokens, not a percentage.** `00-core.md` says "long task under context pressure → /handoff" with no threshold, while the statusline already prints `ctx N%`. Chroma's finding (degradation at 50K on a 200K model) and the platform's own best-practices ("performance degrades as it fills") argue for an absolute trigger. With Opus and Fable now auto-compacting near 1M and Sonnet 5 at 1M, a percentage is meaningless: 50% of 1M is 500K, far past measured degradation. Recommend: pipeline stages hand off at a fixed token count (order of 120–150K), surfaced by the statusline in tokens as well as percent. *Trace: this session read three 40–96 KB dumps in one turn; docs/01 already labels the 40–50% figure single-source.*

**2.2 Output offloading is a rule for scouts but not for the main loop.** The scout must return paths not contents; nothing tells the main session to read excerpts. The platform now clears old tool outputs first on compaction, so the cost is hidden until compaction and then paid as lost instructions. Add one Context-economy line: main-loop reads are targeted (offset/limit, `sed -n`), whole-directory dumps go through a subagent or to a scratch file that is grepped. Same lesson arXiv 2603.20432 measures: externalise text into files and tools, do not hold it in attention. *Trace: this session.*

**2.3 `/validate` floods the window with test output.** Step 3 runs every gate command in the main loop and reads the output. The stop gate already truncates to 800 chars; `/validate` has no cap. Run each command with output to `.claude/state/validate-<n>.log`, read only the tail (≤40 lines) into context, record the log path in the report. Osmani calls this tool-call offloading; it is the cheapest context win in the pipeline.

**2.4 Compaction: the mechanism is still correct, one line is missing.** Verified today against the raw hooks doc: SessionStart still carries `source` (`startup|resume|clear|compact|fork`), Stop still takes top-level `decision: "block"`, PreCompact fires on `manual|auto`, and PostCompact has no decision control, so re-injecting the snapshot from SessionStart(compact) remains the right design. What is missing: invoked skills are re-attached after compaction at 5,000 tokens each within a 25,000 budget, most-recent first, so a stage skill invoked early can drop out. Add to the compact message: "re-invoke the active pipeline skill (`/implement`, `/validate`, …) — its body may have been trimmed". One line in `session-start.mjs`, one fixture. *Trace: skills reference, compaction section.*

**2.5 Blocking Stop hooks lost the turn's reasoning before 2.1.259.** Fixed upstream; note it in the minimum-version guidance because a RED gate on an older version costs the model its reasoning for the fix turn.

## 3. Skills

**3.1 Line budgets hide token density.** The ledger measures always-loaded files in tokens but skill bodies only in lines. `/implement` is 94 lines and roughly 3.5K tokens because its lines run to 250 characters; a 100-line skill can be 4K tokens, most of which is dropped after compaction (5K cap per skill is fine, but the 25K shared budget is not when superpowers skills are stacked inside a stage). Extend `context-ledger.mjs` to print a per-skill token table and warn above a token figure, not a line figure.

**3.2 Restated mechanics are the biggest skill-body cost.** The 2026-08-29 review counted the tracking-root resolution restated six times across skills (M3) and five rules duplicated between AGENTS.md and `00-core.md` (M2). Both are still open follow-ups. Each restatement is a second source of truth that drifts, which is exactly the class fixed today for autonomous mode. Finish M2 and M3 before adding anything.

**3.3 The platform now measures skill waste for you.** `/skill-doctor` (2.1.261) reports loaded skills that go unused and what they cost; `/doctor` (2.1.206+) proposes CLAUDE.md trims for content derivable from the codebase; `/context` shows what loaded. `/evolve` step 4 says "measure, don't estimate" and names only the ledger. Add the three commands as inputs to the pruning pass.

**3.4 `context: fork` is not for the pipeline stages.** Stages need the main loop (they fix, ask, and record). But two side jobs are fork-shaped: the gate runs in 2.3 and the research-gatherer dispatch. Keep the stages inline.

**3.5 Description budget.** The listing truncates `description` + `when_to_use` at 1,536 characters; the harness's ≤40-word rule is well inside it. No change.

**3.6 Skill-scoped hooks with `once: true`** could arm a stage-specific check for the rest of the session (for example, `/implement` registering a PostToolUse reminder to run the task's Validate command). Cheap to try, but it needs an incident first.

## 4. Context preservation across sessions

**4.1 The handoff artifact is the strongest mechanism and the least used.** `/handoff` is manual and has no trigger. Tie it to 2.1's threshold and to `/implement` task boundaries: after every N tasks in a long plan, write the handoff and offer `/clear`. Anthropic's own harness moved from resets to compaction only when Opus 4.6 removed context anxiety; the docs already say "retest per model", so make the trigger a config-free rule of thumb, not a hook.

**4.2 Auto memory is a leading indicator the outer loop ignores.** Auto memory now records `feedback` entries (corrections) with a `modified` timestamp. `/evolve` step 1 lists "user corrections" but never reads `MEMORY.md` deltas since the last evolve. Corrections saved to a machine-local file are rules the team never got. Add MEMORY.md changes as a candidate source, then keep step 6's reconcile (promote to a rule, delete from memory).

**4.3 A runtime ledger is now possible.** The `InstructionsLoaded` hook fires with `load_reason` (`session_start|nested_traversal|path_glob_match|include|compact`) and `file_path`. A ten-line logger writes which rules actually loaded per session. That answers the question the static ledger cannot: do the `paths:`-scoped rules ever fire, and how much Tier-1 tax does a real session pay? Optional; useful before the next prune.

**4.4 Citations by line number rot.** Two historical plans cite the autonomous-mode reference by line range; both went wrong this morning. The plan template asks for `[Source: file:line]`. Cite `file` plus a grep-able phrase; have `/implement` step 1 grep each `Read first:` phrase before Task 1 and log a deviation on a miss. Coordinates rot, semantics hold, as the vault already records.

**4.5 HTML comments are free in CLAUDE.md.** The memory doc states block-level HTML comments in CLAUDE.md files are stripped before injection. That makes `<!-- traces to: … -->` provenance free of context cost on the Claude side. Verify whether the same applies to `.claude/rules/*.md` and remember Codex reads AGENTS.md verbatim, so do it only in Claude-only files.

## 5. Where it hallucinates, and what catches it

The repo's own incident history says the hallucinations here are rarely code logic. They are **stale or invented contract facts** and **self-graded success**:

| Incident | Class | What caught it |
|---|---|---|
| CLAUDE.md claimed a `rules-inject.mjs` hook that never existed (review 2026-08-29, B1) | invented mechanism | adversarial review |
| `globs:` instead of `paths:` loaded every rule every session (AIDF) | silent contract drift | ledger |
| `permission_denials` parsed from an undocumented field | undocumented contract | labelled unverified in docs/99 |
| The "272K surcharge" repeated by blogs, absent from OpenAI's data | secondhand fact | primary-source rule |
| A summarised WebFetch of the hooks page today reported the SessionStart field as `start_reason`; the raw `.md` says `source` | **summariser invention** | grepping the raw source |
| Subagent "all tests pass" relayed without re-running | self-report | "re-run, don't relay" |
| A failing test rewritten to force green (upstream) | evidence tampering | stop-gate tamper check |

**5.1 Summarised fetches invent field names.** `research-gatherer` and the main loop both use WebFetch, which answers a prompt with a small model over the page. For platform-contract claims (field names, frontmatter keys, flags, exit semantics) that is a hallucination vector with no error signal. Docs pages serve raw markdown at `<page>.md`; contract claims must be grepped from raw text, never taken from a summary. Add this to `research-and-docs.md` and to the "platform claims get verified" hard rule. *Trace: this session.*

**5.2 Plan confidence is self-grading.** `confidence: N/10` gates whether the planner asks the user (≤6). Anthropic's finding is that agents "reliably skew positive when grading their own work", and a self-scored 7 never asks. Replace the feeling with a rubric: confidence is capped at 6 unless every `Read first:` file was read this session, every external tool named in the plan is cached at `wiki/stack/<tool>/` or researched, and open questions are zero. Mechanical, two lines in `/plan-work` step 7.

**5.3 "Verify by effect" lives in your prompt.** You had to spell it out for the autonomous-mode fix. The Evidence line accepts reading a config back as evidence. Add the clause: exercise the consumer of a change, never the file that declares it. Pairs with the vault's "checks that cannot fail" note, which the template does not cite anywhere.

**5.4 `Knowledge to load first:` is still checked by nothing.** Review M6 (2026-08-29) proposed a guard check denying a plan write without the field; ADR-014 records the gap. Still open. It is the one place a planner can skip retrieval with `none — <reason>` and nobody notices until review.

**5.5 Empty results read as answers.** `symbol-navigation.md` handles the codebase-search case well ("an empty return is ambiguous"). The same rule is not stated for `grep`-based ratcheted checks in `/validate`, where `|| echo clean` on a mistyped path prints `clean`. Require each ratcheted grep to be run once against a known-positive when it is added (the vault's falsification test).

**5.6 Decisions taken without asking are surfaced by habit, not contract.** Today I chose a minor version bump and a branch commit unasked and mentioned both at the end. Autonomous mode logs these under `## Assumptions`; normal mode has no analogue. Add a second line under "Answers to the user": work that lands ends with the decisions taken unasked, or states there were none.

## 6. Development effectiveness

**6.1 The framework repo runs none of its own harness.** Root `.claude/` holds agent memory and local settings only: no guard, no stop gate, no pipeline skills. This session ran unguarded; `npm test` was run by hand because nothing forced it. Install the payload at the root through the local update path and arm a cheap gate (hook smoke test plus one fast suite). This is the highest-leverage item in the list because every other finding would have been caught earlier by a harness that tests itself.

**6.2 The gate can be disarmed by editing its config.** The tamper check snapshots gated *files* on RED; it does not snapshot the gate itself. An agent can set `stopGate: []` in `harness.json` and the next turn ends GREEN. Same escape class as the upstream test-rewrite incident, same fix shape: on RED, hash the `stopGate` array too, and refuse a GREEN whose gate list shrank. Small addition inside `stop-gate.mjs`, one fixture. *Trace: coleam00/skills escape (docs/99 · 18), extended to the config.*

**6.3 Migrations belong in CLI code, never in skill prose.** Today's `/harness-init` migration line could not be verified headlessly; the real migration went into the CLI and was pinned by effect. Generalise: skills call subcommands; they never carry migration logic. It is ADR-021 one step wider.

**6.4 Docs budgets are breached and unmeasured.** `docs/01` is 140 lines, `docs/03` 136, `docs/99` 144 against a 130 guideline, and the ledger does not look at `docs/`. A rule already violated teaches that rules are optional. Measure docs in the ledger or drop the number.

**6.5 Codex users get no rules.** `.claude/rules/` never reaches Codex; `template/CLAUDE.md` says so. AGENTS.md is the only cross-harness surface. Anything in `00-core.md` that a Codex session must obey (secrets, evidence, dispatch) is invisible there. Either the M2 cut moves the shared rules into AGENTS.md, or the gap is documented per rule.

**6.6 Sprint contracts already exist, under other names.** Anthropic's generator/evaluator "agree on done criteria before code" maps to backlog acceptance criteria plus the plan's per-task `Validate:` line. `qa-evaluator` grades them after the fact. Nothing to add.

**6.7 The reviewer loop is bounded and the noise warning is in place.** Three rounds, then escalate; findings verified before being acted on. Keep.

## Roadmap, ranked across lenses

Tier 1, one pipeline batch each, all incident-traced:

1. Dogfood at the root (6.1).
2. Platform drift: `CLAUDE_CODE_SUBAGENT_MODEL` semantics and `_FORCE`, minimum Claude Code version, docs/99 (1.2, 1.3, 2.5).
3. Gate-config tamper check (6.2).
4. Raw-source rule for contract claims (5.1).
5. Numeric, absolute handoff threshold plus the post-compaction re-invoke line (2.1, 2.4).
6. Output offloading for `/validate` and main-loop reads (2.2, 2.3).

Tier 2:

7. Citation anchors and implement-time re-verification (4.4).
8. Mechanical plan-confidence rubric (5.2).
9. Verify-by-effect clause and decisions-taken-unasked line (5.3, 5.6).
10. `/evolve` reads `/skill-doctor`, `/context`, and MEMORY.md deltas (3.3, 4.2).
11. Finish review follow-ups M2, M3, M6 (3.2, 5.4).
12. Token-based skill measurement in the ledger; docs in the ledger (3.1, 6.4).
13. Migrations-in-CLI rule (6.3).

Tier 3, watch or ablate:

14. `InstructionsLoaded` runtime ledger (4.3); `/verify` versus `qa-evaluator` (1.5); HTML-comment traces after verifying scope (4.5); skill-scoped `once` hooks (3.6); the Codex rules gap (6.5).

## Sources

- code.claude.com/docs/en: hooks.md (raw), memory, sub-agents, skills, context-window, how-claude-code-works, best-practices — read 2026-09-05
- anthropics/claude-code CHANGELOG 2.1.243–2.1.261 — read 2026-09-05
- anthropic.com/engineering/harness-design-long-running-apps
- arXiv 2604.25850, 2602.14690, 2603.20432; Chroma "Context Rot"; addyosmani.com/blog/agent-harness-engineering
- reports/2026-08-29-adversarial-workflow-review.md; reports/2026-08-30-upgrade-path-review.md; `.claude/agent-memory/code-reviewer/MEMORY.md`
- The Vault: `wiki/checks-that-cannot-fail.md`, `wiki/agent-pipeline-and-ci-gotchas.md`, `agent-kb/patterns/`
