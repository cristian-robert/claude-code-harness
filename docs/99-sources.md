# 99 · Sources — Provenance Ledger

Every load-bearing PHE decision traces to one of these sources (1–11: research pass 2026-07-07; 12–17: v0.3 agile-layer pass 2026-07-08; "Model policy": model-tier-map pass 2026-07-12). The three coleam00 clones live in this repo and are read-only.

## 1 · Harness design for long-running apps — anthropic.com/engineering/harness-design-long-running-apps
Anthropic Labs on a Planner/Generator/Evaluator harness for long-running autonomous builds.
- Context RESETS + structured handoff artifact beat compaction → Plan and Implement in separate sessions, artifacts on disk.
- Self-evaluation bias → generator/evaluator split → `/review-branch` dispatches an independent reviewer; self-grading is never the gate.
- Ablation discipline: on model upgrade remove one component at a time and measure → `/evolve`'s prune step.

## 2 · Effective context engineering — anthropic.com/engineering/effective-context-engineering-for-ai-agents
Anthropic Applied AI on curating the whole token budget, not one prompt.
- North star: the "smallest possible set of high-signal tokens" — PHE's context principle, quoted in docs/00.
- Hybrid retrieval (CLAUDE.md "naively dropped in" + JIT grep/read) → the two-tier loading design.
- Subagent contract: explore wide, return a ~1–2k-token summary → dispatch rules in `template/.claude/rules/00-core.md`.

## 3 · Claude Code official docs — code.claude.com/docs (hooks, memory, settings, sub-agents, skills, plugins)
The platform contract every PHE mechanism is built against.
- Exact hook I/O: stdin JSON, `permissionDecision: deny`, `stop_hook_active`, 8-consecutive-block Stop ceiling → guard.mjs, stop-gate.mjs.
- Rule frontmatter is `paths:` (never `globs:`); memory load order; real skill frontmatter fields only.
- **Subagent model resolution** (verified 2026-07-12, `/en/sub-agents#choose-a-model`): `CLAUDE_CODE_SUBAGENT_MODEL` → per-invocation `model` → frontmatter `model:` → the main conversation's model. `/en/model-config#environment-variables` on that env var: *"The model to use for all subagents and agent teams. Overrides the per-invocation `model` parameter and the subagent definition's `model` frontmatter."* It therefore silently defeats the sibling-reviewer rule → the warning in `template/.claude/references/dispatch-protocol.md`.
- **Drift warning:** the docs are versioned and change — re-verify hook schemas and frontmatter keys on every Claude Code upgrade.

## 4 · Anthropic engineering quartet — claude-code-best-practices · building-effective-agents · writing-tools-for-agents · multi-agent-research-system
Four anthropic.com/engineering posts on agent, tool, and multi-agent design. (best-practices now redirects to code.claude.com/docs/en/best-practices — rewritten; re-check quotes against the live page.)
- "Give Claude a check it can run" + evidence over assertion → the stop gate and the "Done = evidence" hard rule.
- Workflows before agents; simplest thing that works; tool litmus test: if a human can't pick the tool, neither can the AI.
- Orchestrator–worker with self-contained dispatch prompts and explicit effort scaling → subagent dispatch rules.

## 5 · coleam00/harness-engineering-demo — github.com/coleam00/harness-engineering-demo (cloned during research, since removed)
- Its `codebase-search` MCP (AST `where_is`/`find_references`/`outline`) is generalized and shipped in the payload (`.claude/tooling/codebase_search.py`) — the symbol-navigation-first search discipline.
Working minimal harness (video companion) wrapped around a brownfield FastAPI+Next.js app.
- PIV skills with `disable-model-invocation: true`, `plans/` + `reports/` disk handoffs, Handoff line → PHE's pipeline shape.
- Three-hook wiring (PreToolUse deny / PostToolUse advisory / Stop gate), fail-open hooks, hard rules that name their enforcer.
- Ralph loop mechanics: DONE sentinel, `fix_plan.md` running log, commit per iteration, worktree + DB isolation → `loop/`.

## 6 · coleam00/cole-medin-ai-coding — github.com/coleam00/cole-medin-ai-coding (cloned during research, since removed)
OKF knowledge bundle distilling five of Cole Medin's videos into cross-cutting concept docs.
- Vocabulary and thesis: prompt → context → harness engineering; the PIV loop; "the AI layer"; the rule of three.
- Fresh-session implement + subagents for exploration ("just because you can fit a million tokens doesn't mean you should").
- The anti-goal: Spec Kit/BMAD named as "over-engineered and hard to mold" → PHE's minimal-and-moldable stance.

## 7 · coleam00/second-brain-starter — github.com/coleam00/second-brain-starter (cloned during research, since removed)
PRD-generator meta-repo for a personal AI memory assistant (one skill + memory templates; nothing else ships).
- Memory-layer-first build order: plain-markdown memory before any automation → PHE's knowledge layer stays plain files.
- SessionStart/PreCompact/SessionEnd memory flows informed session-start.mjs orientation context.
- Interview-template → personalized plan-on-disk pattern echoed in `/plan-work`'s brain-dump intake.

## 8 · AIDevelopmentFramework v0.8 — `../AIDevelopmentFramework-1` (user's prior framework)
The hard-won defects list PHE's tests and design explicitly guard against.
- `globs:` instead of `paths:` silently defeated rule scoping — a ~4x always-loaded token tax → context-ledger.mjs + the hard rule.
- Two hooks shipped inert (read argv, not stdin JSON); settings.local.json leaked team config → smoke-test.mjs + committed settings.json.
- Kept on merit: the output-contract one-liner, machine-parseable reviewer verdicts, marker-file-over-transcript-scan enforcement, line budgets + ledger.

## 9 · The user's Obsidian vault — `../The Vault`
Cross-project canonical KB; the working example of knowledge-as-harness-component.
- Index Law: any folder you create or change → create/update its `_index.md` in the same change (cited verbatim in PHE's CLAUDE.md).
- Pointer block (`system/pointer-block.md`): repo CLAUDE.md → vault, with a mandatory write-back clause → the template's paste-here comment.
- SentrOS dispatch lessons: explicit `model:` on every dispatch, self-contained prompts, re-run-don't-relay verification → `template/.claude/rules/00-core.md`.

## 10 · Community corpus
ghuntley.com/ralph + github.com/ghuntley/how-to-ralph-wiggum · github.com/humanlayer/12-factor-agents + humanlayer.dev/blog/brief-history-of-ralph · github.com/obra/superpowers · github.com/disler/claude-code-hooks-mastery · github.com/Wirasm/PRPs-agentic-eng · addyosmani.com/blog/agent-harness-engineering · docs.bswen.com (CLAUDE.md bloat).
- Ralph: fresh context per iteration, state only on disk/git, sentinel stop — Horthy/HumanLayer's "carve off small bits of work into independent context windows" is `loop/`'s semantic.
- superpowers: the REQUIRED execution discipline inside PIV stages (user directive); hooks-mastery: PreToolUse enforces "without LLM judgment".
- Osmani: ratchet principle + "harnesses don't shrink, they move" → `/evolve` prunes as well as adds.
- PRP ("PRD + curated codebase intelligence + agent runbook") shaped the plan template; bswen's bloat folklore backs the hard line budgets.

## 11 · The user's global ~/.claude inventory
101-line global CLAUDE.md, 4 agents, 65 skills, 19 plugins, zero hooks, permissions wide open.
- Baseline to extend, not duplicate: superpowers + commit plugins already installed globally; PHE ships project scope only.
- Zero global hooks + `defaultMode: auto` → project hooks are the only deterministic layer; `global/` hardening stays opt-in, never auto-applied.
- Observed skill duplication (brainstorming, skill-creator, frontend-design ×2) → PHE's one-canonical-owner-per-capability rule.

## v0.3 pass — agile delivery-org layer (2026-07-08)

Evidence base for `docs/06-delivery-org.md` and the `/backlog` · `/sprint` · `/accept` surface.
Full brief in the vault: `inbox/research/phe-harness/v3-agile-layer.md`.

## 12 · BMAD-METHOD — github.com/bmad-code-org/BMAD-METHOD (tag v4.44.1 + main/v6)
The role-roster reference implementation AND the over-engineering cautionary tale, both.
- The decision-relevant fact: v4→v6 compressed 10 personas to 6 and folded SM+QA agents into skills ("everything… converted to markdown with SKILL.md entrypoints") — roles as hats, not standing agents.
- Story contract stolen: per-section `owner`/`editors` write-locks (`story-tmpl.yaml`), mandatory `[Source: …]` citations, previous-story Dev-Agent-Record memory (`create-next-story.md`).
- Cost critique kept as anti-scope evidence: medium.com/@reenbit/bmad-vs-spec-kit-vs-openspec-choosing-your-spec-driven-ai-framework-in-2026-a6996b3ebb8d (12 min OpenSpec vs 5.5 h BMAD); rywalker.com/research/bmad-method ("$800–2,000+/month per developer", "scored lowest on time-to-pull-request").

## 13 · github/spec-kit — github.com/github/spec-kit
Constitution + per-feature `specs/` pipeline; role "bundles" are opt-in on a role-agnostic core.
- Confirms roles-as-optional-add-on; its full per-feature artifact set (data-model, contracts, research, quickstart) is the anti-scope line PHE does not cross.

## 14 · Agent-OS — github.com/buildermethods/agent-os · buildermethods.com/agent-os
Single-agent context-injection layer with zero roles: Standards / Product / Specs, all plain markdown.
- The no-role counterweight: durable-vs-ephemeral context split maps onto CLAUDE.md + `.claude/` with no personas at all.

## 15 · Backlog.md — github.com/MrLesk/Backlog.md (+ github.com/naggie/dstask)
Markdown-native file-per-task backlog, dogfooded by AI agents ("nearly all… code is written by AI agents").
- Frontmatter schema, AC as machine-parseable checkbox lists, "one task per agent session"; the board is always DERIVED from frontmatter, never stored → PHE's grep-board rule.
- Git merge mechanics (docs.github.com/articles/about-merge-conflicts) + dstask's per-task files: file-per-item structurally avoids cross-item conflicts → `backlog/<id>-<slug>.md`.

## 16 · gh CLI manual + GitHub REST — cli.github.com/manual · docs.github.com/en/rest
The GitHub-backend mechanics, verified per command.
- Native since gh v2.94.0: sub-issues/types/dependencies (github.blog/changelog/2026-06-10-manage-sub-issues-types-and-dependencies-from-github-cli) → epics as parent issues.
- No native milestone command (cli/cli#1200) → sprints via `gh api repos/…/milestones` (docs.github.com/en/rest/issues/milestones).
- **The sharp edge:** Projects v2 needs the `project` OAuth scope; `gh auth refresh -s project` is browser-interactive — no headless mint — and the Actions `GITHUB_TOKEN` cannot access Projects (docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/automating-projects-using-actions) → labels + milestones only.
- Secondary rate limit: content creation 80/min & 500/hr (docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) → batch/backoff on bulk import.

## 17 · Practitioner consensus — AI-Scrum and markdown-kanban posts
engineeringexec.tech/posts/ai-scrum-can-proven-agile-principles-work-for-agent-teams · devops.com/coding-agent-teams-the-next-frontier-in-ai-assisted-software-development · dev.to/battyterm/i-let-ai-agents-manage-themselves-with-a-markdown-file-5547
- "An AI agent cannot be a Product Owner" → Stakeholder and PO decisions stay human; role layering optional and scalable, never mandatory.
- Role-tagged `SPRINT_N.md` files → `sprints/<n>.md`; independent frontmatter-kanban conventions converge on id/status/priority → the item schema.

## Model policy (verified 2026-07-12)

Evidence base for `docs/04-model-policy.md` and `.claude/harness.json` → `models`. Every model ID,
price, window, and effort level in those two files was read from a primary source on this date — none
of it from model memory, which predates the gpt-5.6 family (shipped 2026-07-09).

- **`openai/codex`** → `codex-rs/models-manager/models.json` — the shipping catalog: the three
  gpt-5.6 IDs (`-sol` / `-terra` / `-luna`), `context_window: 372000`, and `supported_reasoning_levels`
  (luna is the one 5.6 model without `ultra`). Also the source of the effort-default contradiction:
  `gpt-5.6-sol` defaults to `low` here while the docs say `medium` → PHE never inherits effort.
- **`openai/codex`** → `codex-rs/model-provider/src/models_endpoint.rs` — the catalog endpoint
  `/models` re-verifies against.
- **developers.openai.com/api/docs/pricing** — per-1M in/cached-in/out: sol $5/$0.50/$30 ·
  terra $2.50/$0.25/$15 · luna $1/$0.10/$6.
- **Installed `codex-cli 0.144.0`** — cross-check that the catalog above is what the local binary ships.
- **Anthropic model reference** — Claude per-1M in/out (opus-4-8 $5/$25 · sonnet-5 $3/$15 · haiku-4-5
  $1/$5 · fable-5 $10/$50); the ~30%-denser tokenizer on Opus 4.7+/Sonnet 5/Fable 5; Haiku 4.5 rejects
  the `effort` parameter.

## Claims we deliberately labeled as unverified

Directional only — never load-bearing. Do not hard-code these into rules, hooks, or budgets. The last
row is stronger than unverified: we went looking for it in the primary sources and it is **not there**.

| Claim | Why it is soft |
|---|---|
| Context degrades noticeably at 40–50% fill (~400K effective of 1M) | Single self-reported GitHub issue thread (anthropics/claude-code #34685), not an Anthropic benchmark |
| "12 well-chosen rules cut error rate 41% → 3%" | Secondhand aggregation of an unspecified source; never traced to primary data |
| ~6.7% bare-model vs ~70% harnessed PR acceptance (Stripe ~1,300 AI PRs/week) | Cole Medin's reported figures; not independently verified |
| Codex bills 2× input / 1.5× output on the whole request past 272K input tokens | The `(<272K context length)` annotation appears on gpt-5.5/5.5-pro/5.4/5.4-pro rows and on NO gpt-5.6 row; 272K is the 5.4/5.5 *context window*, not a 5.6 billing threshold. No $45 output price exists in OpenAI's pricing payload. Widely repeated by third-party blogs; not in OpenAI's own data. Do not budget against it. |
| Claude Code ignores unknown agent-frontmatter keys — so our `tier:` key is inert | Checked `/en/sub-agents#supported-frontmatter-fields` (2026-07-12): it lists the supported fields, says *"Only `name` and `description` are required"*, and says **nothing** about unknown/extra keys — not ignored, not rejected, not validated. `tier:` is not among the documented fields, and the only "ignored" statements on that page concern *documented* fields on plugin subagents. Our smoke test asserts nothing about the platform: it checks `tier` against PHE's **own** allowlist and never exercises Claude Code's parser. `tier:` may well be inert, but we have not shown it — treat a future frontmatter-strictness change as a live upgrade risk. |
