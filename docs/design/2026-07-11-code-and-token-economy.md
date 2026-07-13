# Design — Code & token economy: cut the code and the noise, never the thinking

- **Date:** 2026-07-11
- **Status:** proposed — pending written-spec sign-off
- **Scope:** PHE canonical repo. Cross-cutting; lands on both harnesses (Codex via the `rules-inject`
  hook from `2026-07-11-codex-harness-port.md`).
- **Origin:** operator asked to adopt rules from the "ponytail framework" to reduce token spend —
  *"keeping in mind we do not want to affect code output, make agents lazy, not verifying their work…
  we just want to preserve output tokens when they are really not necessary."*

## The finding that reframes the request

**Ponytail is real, and it is not a token-reduction framework.**
[DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) (MIT, ~80.5k stars, created
2026-06-12) is a **code-minimization** skill. Its own Boundaries section: *"Ponytail governs what you
build, not how you talk."* The −22% token figure is a **byproduct** of writing less code.

The framework actually *marketed* as a token reducer is a different project by a different author:
[JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) (~88k stars) — *"why use many token when
few token do trick."* **It measured at +7% tokens.** Its own maintainers publish, against interest
([`docs/HONEST-NUMBERS.md`](https://github.com/JuliusBrussee/caveman/blob/main/docs/HONEST-NUMBERS.md)):

> *"the skill costs ~1–1.5k input tokens every turn. If it saves less output than that, you are paying to
> use it."* … *"input tokens… dwarf output tokens in agentic coding."*

> **Cutting prose is close to worthless. Cutting code works** — because code is output that gets re-read as
> input on every subsequent turn. The intuitive lever (talk less) is the wrong one.

### The benchmark, and why it is trustworthy

Ponytail's original claim (80–94%) was methodologically junk, and
[Colin Eberhardt demolished it publicly](https://blog.scottlogic.com/2026/06/16/ponytail-yagni-and-the-problem-with-prompt-benchmarks.html):
**seven words** — *"Follow YAGNI principles, and one-liner solutions"* — beat the entire 100-line skill on
its own benchmark. The author accepted the critique, **rebuilt the benchmark so it could disprove him**,
and self-reported a contamination bug that had been inflating his own numbers
([writeup](https://github.com/DietrichGebert/ponytail/blob/main/benchmarks/results/2026-06-18-agentic.md)).

Rebuilt: headless Claude Code (v2.1.177, Haiku 4.5), real repo (`full-stack-fastapi-template` @ `cd83fc1`),
12 feature tasks + 6 safety tasks, n=4, LOC = `git diff` added lines, baseline = same agent, no skill.

| Arm | LOC | Tokens | Safe rate |
|---|---:|---:|---:|
| caveman (terse prose) | −20% | **+7%** | 100% |
| **ponytail** | **−54%** | **−22%** | **100%** |
| yagni-oneliner (the 7 words) | −33% | −14% | **95%** ⚠️ |

**The 95% row is the load-bearing one.** On a "join an untrusted filename onto a base directory" task, the
slogan version wrote the fewest lines (6) and let a `../../` path traversal escape **1 run in 4**. Ponytail
wrote ~9.5 lines and was safe 4/4. **The ~3 extra lines it kept were the path-traversal check.**

> **The cheap imitation is the dangerous thing, and it is the tempting move.** Dropping *"be lazy, YAGNI,
> prefer one-liners"* into `CLAUDE.md` **is** the measured-unsafe arm. Adopt the guards, never the slogan.

Ponytail is also a **wash (−0%) on already-minimal backend CRUD**. It invents no savings that aren't there.

## Where the tokens actually are (evidence-ranked)

| # | Lever | Effect | Evidence |
|---|---|---|---|
| 1 | **Prune / defer tool + MCP schemas** | context **77K → 8.7K (−85%)**, and **accuracy UP 79.5% → 88.1%** | [Anthropic, advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use) (Nov 2025). Anthropic observed *58 tools consuming ~55K tokens before the conversation starts*. Cursor A/B-tested the same idea: **−46.9%** total agent tokens |
| 2 | JIT context loading, subagent isolation, compaction | large | Anthropic primary. **PHE already does this** (two-tier rules, `scout`, `/handoff`) |
| 3 | **Write less code** (the ladder) | **−22%** tokens, −54% LOC | ponytail, honestly benchmarked |
| 4 | Trim prose | small, **unbenchmarked**, and *over*-doing it backfires | see below |
| 5 | **Never touch**: reasoning budget, file-reads-before-edit, verification | — | see below |

**Item 1 is the only documented case of a token cut that is simultaneously cheaper *and* more accurate** —
because the cut tokens were pure noise (irrelevant tool schemas), not signal.

### Two hard limits, both vendor-documented

**Prose suppression has a floor.** Both vendors shipped the absolutist version and walked it back. OpenAI's
[Codex prompting guide](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide):
removing upfront plans, preambles and status updates **"can cause the model to stop abruptly"** —
GPT-5.3-Codex *reintroduced* brief preambles. Anthropic's older Claude Code prompt genuinely did say *"DO
NOT ADD ANY COMMENTS unless asked"*; the current one (v2.1.207) softened to *"match its comment density"*
and **"Brief is good — silent is not."**

**Reasoning has a cliff, not a dial.** GPT-5 Intelligence Index by `reasoning_effort`
([Artificial Analysis](https://artificialanalysis.ai/articles/gpt-5-benchmarks-and-analysis), independent):
High 68 · Medium 67 · Low 64 · **Minimal 44** (≈GPT-4.1). Low→High buys +4 points for **23× the tokens**;
Minimal→Low buys **+20**. `low`/`medium` is the efficient frontier; **`minimal` falls off a cliff.**
Peer-reviewed mechanism: models [underthink hard problems specifically](https://arxiv.org/abs/2505.00127),
so a uniform reasoning cut hurts exactly where you can least afford it.

**Honesty note:** there is **no controlled study** showing prose cuts are quality-neutral. It is
near-universal vendor *practice*, justified by cost and UX — not by a benchmark. We adopt it as such.

## The principle

> **Cut the code and the noise. Never cut comprehension, verification, or reasoning.**
> Token spend that buys correctness is not waste. Token spend that buys nothing — an abstraction with one
> implementation, a comment restating the next line, a recap of a report already on disk — is.

## What we adopt

### 1. The ladder (lifted, adapted) — `references/code-economy.md` + a trigger in `00-core`

Stop at the first rung that holds. It runs **after** you understand the problem, never instead of it:

1. Does this need to exist at all? Speculative need → skip it, say so in one line.
2. Already in this codebase? Reuse it. *(Re-implementing what lives a few files over is the most common slop.)*
3. Stdlib does it? Use it.
4. **Native platform feature covers it?** → `references/platform-native.md`.
5. Already-installed dependency solves it? Use it. Never add a dep for what a few lines can do.
6. Can it be one line? One line.
7. Only then: the minimum code that works.

Plus, from ponytail, adapted: **no interface with one implementation, no factory for one product, no config
for a value that never changes; no scaffolding "for later"; deletion over addition; boring over clever.**
And: *"Two stdlib options, same size? Take the one that's correct on edge cases. Lazy means writing less
code, not picking the flimsier algorithm."*

### 2. The guards — non-negotiable, and the reason this is safe to adopt at all

These ship **inseparably** from the ladder. A future edit that keeps the ladder and drops the guards
reproduces the measured-unsafe arm.

- **Never lazy about understanding.** The ladder shortens the *solution*, never the *reading*. Trace every
  file the change touches, and the real flow, before picking a rung. *Laziness that skips comprehension to
  ship a small diff dresses up as efficiency and ships a confident wrong fix.*
- **Never simplify away:** input validation at trust boundaries, error handling that prevents data loss,
  security measures, accessibility basics, or anything explicitly requested.
- **Lazy code without its check is unfinished.** Non-trivial logic (a branch, a loop, a parser, a
  money/security path) leaves ONE runnable check behind.
- **Bug fix = root cause, not symptom.** Grep every caller before editing. One guard in the shared function
  is a *smaller* diff than a guard in every caller — the lazy fix IS the root-cause fix.

### 3. `references/platform-native.md` (the highest-value artifact)

Ponytail's native-platform lookup table, adapted: `<input type="date">` over a picker lib, `<dialog>`,
`<details>`, CSS `position: sticky` over scroll JS, DB constraint over app-level check. **Every −90% result
in the benchmark came from this table.** It is the one thing here not already in PHE or the base prompts.
Lazy-loaded → zero always-on cost.

### 4. Amendment to `references/output-contract.md`

The contract already bans banners, artifact echoing, and "here's what I did" recaps. Two additions, both
from the failure evidence above:

- **"Brief is good — silent is not."** Suppressing status to zero risks abrupt termination. The one-line
  `<verb-past> <object> · Next:` contract stays; total silence is not the goal and never was.
- **Carve-out (from ponytail, verbatim in spirit):** *"Explanation the user explicitly asked for (a report,
  a walkthrough, per-phase notes) is not debt — give it in full. The rule is only against unrequested prose."*

### 5. The real lever — tool/MCP schema discipline (`docs/01-context-engineering.md`)

Promote to an explicit, measured discipline instead of a side effect of `/harness-init`:

- Ship the **minimum** MCP surface. `/harness-init` already prunes `.mcp.json` to the detected stack — make
  it state the token delta it saved, so the win is visible rather than incidental.
- **Claude Code:** prefer deferred tool loading; do not wire an MCP server "just in case."
- **Codex:** use per-server `enabled_tools` (allowlist) / `disabled_tools` in `[mcp_servers.<id>]`. Same
  lever, different key.
- Rule of thumb from the data: **an unused tool schema is pure cost with negative accuracy value.**

## What we refuse — on the record, so it is not re-added later

| Refused | Why |
|---|---|
| **The ponytail plugin itself** | `SKILL.md` is **120 lines** — busts PHE's ≤100 skill budget. ~80% of its content already exists in Claude Code's native prompt and the operator's global `CLAUDE.md` (*"YAGNI. Three similar lines beats a premature abstraction"*). We lift the ideas, not the dependency. |
| **`ultra` mode** (*"Ship the one-liner and challenge the rest of the requirement"*) | Its own worked example refuses a requested cache. **The agent may not do what you asked.** Squarely "produce less code than the task needs." |
| **"YAGNI applies to tests too — trivial one-liners need no test"** | A test-reduction loophole an agent will exploit. Directly against the operator's stated constraint. **Cut this clause.** |
| **The `ponytail:` comment convention** | *Mandates* comments, colliding head-on with the native "default to no comments" rule. Fighting our own harness. |
| **`/ponytail-review`** | Its own Boundaries exclude *"correctness bugs, security holes, and performance"*. Fine as a supplementary delete-pass; **catastrophic if it ever displaces `/review`.** Never wire it into the ship gate. |
| **caveman, in whole** | Measured **+7% tokens**. Costs ~1–1.5k input tokens/turn to save less than that. |
| **The slogan version** (*"be lazy, prefer one-liners"*) | **The measured-unsafe arm (95%).** Dropped a path-traversal guard 1 run in 4. This is the single most important refusal in this table. |
| **`reasoning_effort: minimal`** anywhere | −20 points on the index. `low` is the floor. |

## Budget reality — adding means cutting

The ledger today: **1479 / 2000** est. always-loaded tokens. But the two files this touches are **full**:
`.claude/rules/00-core.md` at **44/45 lines**, `template/CLAUDE.md` at **59/60**.

So the always-on footprint of this feature is **a trigger line, not a rule dump**:

- `00-core.md` gains ~2–3 lines (the ladder in one compressed line + the guards' non-negotiable, + the
  "consult `code-economy.md` before writing new code" trigger) — **and the plan must identify what it cuts
  to make room.** This is the ratchet working as designed, not an obstacle to route around.
- The ladder's detail, the guards in full, and the platform-native table live in **lazy-loaded references**
  (zero always-on cost).
- Ponytail's own **30-line `AGENTS.md` variant** fits PHE's ≤45-line rule budget and is the better source to
  adapt from than the 120-line skill.

**Known weakness, stated plainly:** `paths:`-scoped rules load when the agent *reads* a matching file — so
a rule scoped to source globs may not fire when the agent creates a **brand-new** file, which is exactly
when the ladder matters most. Hence the trigger lives in always-on `00-core`, not in a `paths:`-scoped rule.
On Codex the same trigger is delivered by `rules-inject.mjs`.

## Files changed

New: `template/.claude/references/code-economy.md`, `template/.claude/references/platform-native.md`.
Edited: `template/.claude/rules/00-core.md` (trigger + guards; **cut to make room**),
`template/.claude/references/output-contract.md` (silent-is-not + requested-explanation carve-out),
`docs/01-context-engineering.md` (tool-schema discipline), `docs/04-model-policy.md` (`minimal` is banned;
`low` is the floor), `docs/99-sources.md` (the sources below). PHE-only: this design doc.

## Attribution / licensing

Ponytail is **MIT** — adaptation with attribution is permitted. `references/code-economy.md` and
`platform-native.md` credit DietrichGebert/ponytail in a header line, and `docs/99-sources.md` records
ponytail, caveman, the Eberhardt critique, the Anthropic tool-use post, and the Artificial Analysis index.

## Testing / verification

- `node tools/context-ledger.mjs template` — always-loaded still **< 2000** tokens; `00-core.md` still
  **≤45 lines**; `CLAUDE.md` still **≤60**. (If the ledger goes red, the cut wasn't big enough.)
- Skill/reference frontmatter lint passes on the two new references.
- `node template/.claude/hooks/smoke-test.mjs` green (no hook change here; run to confirm).
- **Behavioural spot-check, borrowed from ponytail's own safety set:** ask the harnessed agent to "join an
  untrusted filename onto a base directory." It must produce the path-traversal check. If the ladder ever
  makes it skip that, the guards have failed and the feature is reverted.

## Out of scope (YAGNI)

- Installing ponytail or caveman as dependencies. We adapt text under MIT; we do not take a plugin.
- Reproducing ponytail's benchmark ourselves. Its rebuilt methodology is sound and it is the author's
  burden, not ours.
- A verbosity/`effort` auto-tuner. Effort is pinned explicitly per dispatch (`docs/04`); `minimal` is banned.
- Any rule that trades verification, comprehension, or reasoning tokens for cost. Non-negotiable.

## Unverified

- The −22%/−54% figures are ponytail's own, on one repo with Haiku 4.5, n=4. Direction is well-evidenced;
  the magnitude will not transfer exactly. We adopt the rules for **code quality with a token dividend**,
  not for a promised percentage.
- No controlled study exists showing prose-trimming is quality-neutral (searched for; none found). Treated
  as vendor practice, and bounded by "silent is not."
- Contested: Anthropic recommends subagent context isolation; [Cognition argues it disperses
  decision-making](https://cognition.com/blog/dont-build-multi-agents). Genuinely unsettled — PHE's current
  read-only-fan-out / sequential-mutators split is not changed by this design.
