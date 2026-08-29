# 2026-08-29 · Adversarial workflow review — verified findings + dispositions

Reviewer: fresh-context Fable subagent, six-lens brief (spec attack · always-loaded audit ·
knowledge-read enforcement · per-stage redundancy + old-harness leftovers · workflow clarity ·
STE100 output-register directive). Every finding below was re-verified in the primary session before
disposition (`superpowers:receiving-code-review`); nothing was accepted on the reviewer's word alone.

Ledger at review time: **WARN 1654/2000 (83%)** — `node tools/context-ledger.mjs template`.

## Dispositions

| SEV | Finding | Verified | Disposition |
|---|---|---|---|
| BLOCKER | B1 phantom `rules-inject.mjs` claim (`template/CLAUDE.md:8`; only grep hit is the claim; `emit-codex.js:13` says guidance-only) | ✅ | **FIXED** this branch (one-line reword; ceremony waived per ADR-003 one-sentence-diff rule) |
| BLOCKER | B2 spec's non-TTY rule made in-session `--apply` a no-op | ✅ | **SPEC FIXED** — `--apply <ids>` carries prior approval and runs non-TTY; only prompting needs a TTY; `userConfig` plugins go to `manual` non-TTY |
| BLOCKER | B3 session-start drift check reads *present* in the committed-settings teammate case — the exact drift it was built for | ✅ | **SPEC FIXED** — component deleted; Claude Code natively prints the install command; `capabilities --check` in `/harness-init` + `/evolve` is authoritative |
| MAJOR | M1 `superpowers:finishing-a-development-branch` has no fallback (`evolve:84`, `review-branch:70`) — pipeline dead-ends when declined | ✅ | **SPEC FIXED** — 2-line fallback added to increment 1 scope |
| MAJOR | M2 five rules duplicated verbatim AGENTS.md:33,41,47,48,49 ↔ 00-core.md:14,24,28,35-37,43-45 (~200 tok at WARN 83%) | ✅ | **FOLLOW-UP (pipeline)** — cut 00-core copies; AGENTS.md is the only cross-harness surface. Funds STE100 (below) |
| MAJOR | M3 tracking-root resolution restated 6× across skills (home: `work-tracking.md`) | ✅ (grep: 6) | **FOLLOW-UP (pipeline)** — shrink to one-line cites, ~35 lines back |
| MAJOR | M4 spec used `command -v` (ADR-007: shell checks fail open on Windows) | ✅ | **SPEC FIXED** — Node PATH scan, PATHEXT-aware |
| MAJOR | M5 "SHA-pinned" promised what install can't deliver | ✅ | **SPEC FIXED** — SHA is proposal-time provenance; post-install re-read records `unavailable(sha-drift)` |
| MAJOR | M6 KB-first protocol: 8 prose sites, 0 enforcement; plan's `Knowledge to load first:` field checked by nothing (ADR-014 records this) | ✅ | **FOLLOW-UP (pipeline)** — ~12-line guard.mjs check: deny `Write(plans/*-plan.md)` lacking a non-empty `Knowledge to load first:` line (`none — <reason>` passes) + smoke fixture; then prune redundant prose. Hook change ⇒ smoke-test rule applies |
| MAJOR | M7 typescript-lsp `when.stack` missed plain-TS repos (`detectTechStack()` has no TS signal); supabase/stripe rows duplicated discovery | ✅ | **SPEC FIXED** — `when.files: ["tsconfig.json"]`; supabase/stripe rows cut (recommended tier resolves at `/harness-init`, where discovery runs anyway); ratchet test asserts `when.stack` ⊆ detector vocabulary |
| MAJOR | M8 `.lsp.json` empty after supersedes; file + reference web (`AGENTS.md:48`, `00-core.md:24`, `symbol-navigation.md`, `harness-init` step 3) would dangle | ✅ | **SPEC FIXED** — increment 2 deletes the FILE and prunes the web |
| MAJOR | M9 harness-init:67 copies the 20-file vault-scaffold (incl. `projects/`, `inbox/raw/`, `inbox/snippets/`, `system/`) into a shared store ADR-014 scopes to `wiki/` + `agent-kb/` | ✅ | **FOLLOW-UP (pipeline)** — selective copy (`wiki/`, `agent-kb/`, `inbox/research/`, `projects/_index.md` registry); delete `inbox/raw/`, `inbox/snippets/` from the scaffold |
| MINOR | m1 detectTechStack is monorepo-blind (root `package.json` only) | ✅ | **SPEC FIXED** — recorded in Known limits; discovery/interview is the monorepo path |
| MINOR | m2 three manifest rows `"why": "same"` broke the spec's own ratchet | ✅ | **SPEC FIXED** — real reasons written |
| MINOR | m3 `/reload-plugins` was an unverified platform claim | ✅ verified: present in the official commands list, fetched 2026-08-29 | **SPEC FIXED** — verification date recorded |
| MINOR | m4 AGENTS.md:29 roles paragraph (~170 tok) restates `delivery-org.md` | ✅ | **FOLLOW-UP (pipeline)** — one sentence + pointer |
| MINOR | m5 codebase-search MCP: 4-file prune choreography for a Python-AST-only tool, superseded by pyright-lsp + native search | ✅ | **SPEC FIXED** — retirement added to increment 2 prune |
| — | init.js:601 stale agent roster (found in the earlier name audit, same class) | ✅ | **FIXED** earlier this branch (`94bc97e`) |

## STE100 output register — reviewer adjudication, PENDING PO DECISION

PO directive: "ENFORCE claude to answer only in ASD-STE100" (source: the two-word deslop technique,
"Use ASD-STE100"; author's own caveats: hurts creative writing, fits ~80% of cases).

The reviewer's adjudication, which this session endorses: **true enforcement is not honest here.**
`docs/02` names blocking style hooks as an anti-pattern ("trains workarounds"); the full ASD-STE100
controlled vocabulary is ASD-licensed and not shippable in a checker; the one decidable slice
(sentence length) false-positives on quoted output and code spans. The honest tier is always-loaded
guidance on the only surface BOTH harnesses read:

Proposed — two lines appended to `template/AGENTS.md` as `## Output register`:

> Write chat replies and prose artifacts (plans/, reports/, knowledge-base/) in ASD-STE100 style: one
> instruction per sentence, ≤20 words per sentence, active voice, no filler. Never restyle code,
> comments, commit messages, quoted output/error text, or user-facing product copy.

Cost ~60 tokens always-loaded, funded by the M2 cuts (~200 back) — net ledger DOWN, per "adding means
cutting". Optional non-blocking rung: one Note-level line in code-reviewer's checklist. Rejected
wirings: output style (Claude-only), rule file (no Codex reach), session-start injection (ignored
surface), hook (docs/02).

**Decision needed from the PO:** accept guidance-tier wording, or insist on a blocking mechanism
knowing the doctrine and licensing objections above.

## Follow-up work queue (pipeline: /plan-work → … per repo hard rule)

1. **Dedup + STE100 batch** (one item): M2 cuts in `00-core.md`, m4 roles trim, `## Output register`
   in AGENTS.md — re-run ledger, target ≤75%.
2. **Knowledge-gate batch**: M6 guard check + smoke fixture + prose prune (M3 tracking-root cites can
   ride along — same "shrink to the reference" motion).
3. **Scaffold hygiene**: M9 selective vault-scaffold copy + scaffold deletions.
4. Increments 1–3 of the dynamic-capabilities spec itself.

Workflow-clarity lens (reviewer lens e): no finding survived beyond the above — the stage entry
points are unambiguous once M3/M6 land; `/plan-work` vs `/backlog` vs brainstorming and `/validate`
vs stop-gate vs post-edit are layered, not overlapping (different scopes, different costs).
