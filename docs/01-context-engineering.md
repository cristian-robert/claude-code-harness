# 01 · Context Engineering — The Attention Budget

## Why: context rot

Attention is quadratic: n tokens create n² pairwise relationships. As context grows,
recall degrades — a gradient, not a cliff, "across all models" (Anthropic). North star:
**"the smallest possible set of high-signal tokens that maximize the likelihood of some
desired outcome."** Fill guidance — single-source anecdote, NOT a benchmark (claude-code
issue #34685): degradation noticeable from ~40–50% window fill. Directional only, but the
operational rule holds: a fresh session executing a disk artifact beats a degraded one.

## The tier model (normative)

A tier = when it loads × who pays. Every context artifact belongs to exactly one; the
design move is always the same: push weight DOWN the tiers. Demotion ladder (`/evolve`
pruning): Tier 0 → 1 → 2 → 3 → deleted.

### Tier 0 — always loaded (every session pays)

| Item | Budget (est. tok) |
|---|---|
| Root `CLAUDE.md` — chain: managed → user (`~/.claude`) → project, closest-to-cwd LAST; on a genuine contradiction the model may follow either, so deduplicate | ≤650 (~60 lines) |
| Unscoped rules (`.claude/rules/*.md` without `paths:`) — 00-core | ≤400 (~45 lines) |
| Knowledge-skill descriptions — the Tier-2 gates | ≤80 each · ≤320 total |
| Auto-memory `MEMORY.md` loaded slice (platform caps: first 200 lines / 25KB) | ≤400 |
| SessionStart injection (`session-start.mjs` `additionalContext`) | ≤150 |
| **Aggregate** — `node tools/context-ledger.mjs <dir>` fails the check when over | **≤2000** |

`disable-model-invocation: true` skills (the PIV pipeline) cost NOTHING here — not in
context at all. The skill listing itself is platform-budgeted: descriptions trim to ~1%
of the window, least-used dropped first — a never-invoked knowledge skill silently
vanishes from the listing, which IS the pruning signal. Trim listings you don't own via
`skillOverrides` (`"name-only" | "off"`, `/skills` → settings.local.json); plugin skills
only via `/plugin`.

### Tier 1 — auto-trigger (loads when Claude reads a matching file)

| Container | Owns | Budget |
|---|---|---|
| `paths:`-scoped rule | constraints about a file TYPE — how this kind of code must be written | ≤45 lines |
| Subdirectory `CLAUDE.md` | facts about a PLACE — local layout, commands, traps | ≤30 lines |
| Knowledge skill with `paths:` | area procedures too big for a rule, or needing bundled assets / `` !`cmd` `` freshness | ≤100 lines |

Never duplicate type rules into place files or vice versa. A rule that accretes procedure
past 45 lines splits: constraints stay in the rule, procedure becomes a `paths:` skill.

### Tier 2 — model-invoked knowledge (Claude's judgment pulls it in)

Knowledge skills: `user-invocable: false`, pushy description ("consult BEFORE …"), body
≤100 lines, hard cap 4 per project. Also Tier 2: auto-memory topic files — MEMORY.md's
loaded slice is the index, topic files load on demand.

**Decision record — knowledge skills beat a CLAUDE.md-gated `.claude/context/` table**
(Cole's context-module pattern): the trigger table is always-loaded prose YOU maintain,
the skill listing is platform-managed gating; a second Read duplicates a context file
in-window, a re-invoked identical skill dedupes to an "already loaded" note; skills carry
forward through compaction (table below) while a context file is gone until re-Read. Plus
`` !`cmd` `` freshness, `paths:` scoping, ledger measurability. Cole's module ANATOMY
(covers / does NOT cover / entry points) lives on — inside the knowledge-skill bodies.

### Tier 3 — explicit-invoke only (zero ambient cost)

Pipeline skill bodies (`disable-model-invocation: true`) on slash command ·
`.claude/references/*` when a rule/skill cites the path · `plans/` + `reports/` artifacts
when a stage reads them · `@imports` (max depth 4) when the containing file loads.

## What survives compaction

| Context | After compaction |
|---|---|
| Root CLAUDE.md + unscoped rules | Re-injected from disk |
| Auto-memory MEMORY.md | Re-injected |
| `paths:`-scoped rules + nested CLAUDE.md | LOST until the next matching file read |
| Invoked skill bodies | Re-attached: capped 5,000 tok/skill, 25,000 tok total, most-recent first |
| Skill listing | NOT re-injected — only previously invoked skills survive |

Consequences: the most important instructions go at the TOP of every SKILL.md (truncation
keeps the start), and Tier 1 degrades exactly when sessions are longest — `pre-compact.mjs`
snapshots state to `.claude/state/` and `session-start.mjs` (source=compact) re-injects it.

## Right altitude

CLAUDE.md is advisory prose ("context, not enforced configuration"). Two failure modes
bracket the target:

| Too low | Too high | Right |
|---|---|---|
| Hardcoded if-else pseudologic — brittle, high-maintenance | Vague platitudes ("write good code") — assumes shared context | Strong heuristics: specific enough to steer, flexible enough to generalize |

- Minimal ≠ short. Supply the full set of information the behavior needs — then nothing more.
- Structure with headers and labeled sections; the model navigates blocks better than prose.
- Add instructions only for OBSERVED failures — the ratchet. No speculative hardening.
- Few-shot = a few diverse canonical examples. Never a laundry list of edge cases.
- Per-line test: would removing this cause mistakes? If not, cut.

| CLAUDE.md: include | Exclude |
|---|---|
| Commands Claude can't guess (custom build/test invocations) | Anything derivable from the code itself |
| Deviations from ecosystem defaults | API documentation (reference file, load on cite) |
| Gotchas — practices NOT self-evident from code | File-by-file codebase maps (glob/grep is fresher) |

## Budgets (enforced, measured)

Per-item budgets live in the tier tables above; the ledger measures each plus the ≤2000
aggregate. Measure, don't estimate. Cautionary incident (AIDF, pre-v0.7): rule frontmatter
used `globs:` instead of `paths:`. Claude Code silently ignores unrecognized keys, so every
"scoped" rule loaded into every session — ~3.5k always-on tokens instead of ~870, a 4x tax
invisible until a ledger tool existed. Morals: wrong frontmatter fails silently; a budget
without a measuring tool is a wish.

## Long-horizon techniques

| Technique | Mechanic | Use when |
|---|---|---|
| Compaction | Summarize the near-full window, reinit with summary + 5 most recently accessed files. Steerable: put "when compacting, preserve X" in CLAUDE.md. Tune recall first, then precision | Extensive back-and-forth where conversational flow matters |
| Structured note-taking | Agent persists notes outside the window, re-reads later. The PIV artifacts ARE the notes: `plans/<slug>-plan.md`, `reports/*`, loop `fix_plan.md` | Iterative development with clear milestones |
| Subagents | Explore in their own window; return a 1–2k-token distilled summary to the lead | Breadth-first exploration you want out of the main window |
| Full reset + handoff artifact | `/handoff` writes `reports/<slug>-handoff.md`; `/clear`; next session cold-starts from the artifact | Long autonomous work. Resets beat compaction — compaction leaves "context anxiety" (premature wrap-up) intact |

PHE default: notes + resets — that is what PIV+E is. Compaction is the fallback when a
session must continue, not the plan.

## Subagent economics

Token usage alone explains ~80% of performance variance in agentic search, and multi-agent
systems burn ~15x the tokens of single-agent chat (Anthropic). Coupled coding never fans
out — multi-agent "struggles with tasks requiring shared context", i.e. most coding.
Effort bands, the 4-element brief, and the per-stage fan-out map ship in the template:
`.claude/rules/00-core.md` + `.claude/references/dispatch-protocol.md`. Embed the numbers
in dispatch prompts ("agents struggle to judge appropriate effort"); every dispatch is
self-contained and pins `tier:` + `effort:` — a ROLE (`scout`/`build`/`deep`), never a model
name. `.claude/harness.json` → `models` resolves the role, and is the one file that names a model.

## Sources

- Anthropic — "Effective context engineering for AI agents" (context rot, altitude, long-horizon techniques)
- Anthropic — "How we built our multi-agent research system" (token economics, effort scaling)
- Claude Code docs — memory (load order, lazy loading, MEMORY.md limits, @import depth); context-window page (compaction survival, skill re-attachment caps, listing budget); skills reference (invocation-control matrix, `skillOverrides`)
- anthropics/claude-code issue #34685 — fill-degradation anecdote (community, single source)
- AIDF v0.7 changelog — the `globs:` → `paths:` incident and ledger measurements
