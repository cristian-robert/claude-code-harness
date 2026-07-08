# Loop Spec: <feature name / ticket id>

<!-- Copy to loop/PROMPT.md and fill every placeholder. Each iteration is a
     FRESH headless Claude with zero conversation memory: it sees only this
     file, the repo, and loop/fix_plan.md. Write for that agent. -->

#<!-- This session is autonomous — activation per .claude/references/autonomous-mode.md. -->

# Goal

<One paragraph: the end state that must exist when the loop is done, and why.
Declare outcomes, not steps.>

## Spec Items (all must pass for DONE)

<Numbered, independently verifiable conditions — each with a command or
observable check. This list IS the termination contract; vague items never
converge.>

1. <e.g. `CsvExport` implements the `ExportService` interface>
2. <e.g. `csv_safe()` prefixes cells starting with `=` `+` `-` `@`>
3. <e.g. `<lint command>` exits 0>
4. <e.g. `<test command>` exits 0>

## Work Pattern

- Do ONE logical change per iteration, then stop. Small compounds; big drifts.
- Orient first: read `loop/fix_plan.md` and the relevant code before editing.
- After each change, run the matching validation command(s) from Spec Items.
- State persists ONLY via the repo and `loop/fix_plan.md` — nothing else
  survives to the next iteration.
- APPEND to `loop/fix_plan.md` (never overwrite earlier entries):

  ```
  ## Iteration N
  - Did: <what changed>
  - Validation: `<command>` → PASS | FAIL
  - Next: <what's left>
  ```

- When ALL spec items are verified passing — and only then — run
  `touch loop/DONE.txt`. NEVER create it earlier: the driver stops on its
  existence alone and trusts nothing you say about being done.

## Guardrails (higher number = more critical)

- 901 — DO NOT implement placeholders, stubs, or "simple versions for now".
  Full implementations only. A stub that compiles is a failure, not progress.
- 902 — Do not assume a feature is missing. Search the codebase first (use
  subagents for wide searches) before adding anything new.
- 903 — Never weaken tests, lints, or checks to make them pass. Fix the code.
- 904 — If the same fix fails twice, write the findings to `loop/fix_plan.md`
  and stop touching that area this iteration; the next iteration re-plans.
