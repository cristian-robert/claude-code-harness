# Output contract

Applies to PIPELINE skills only. Knowledge skills (`architecture-map`, `debugging-this-repo`) are consulted mid-task and emit no final line. Verdict-carrying stages may prefix the verdict: `/review-branch` → `Reviewed <slug>: <PASS|REQUEST_CHANGES> · Next: <command>`, `/validate` → `Validated <slug> · Next: ...` after a `GATE GREEN/RED` line — the `<verb-past> <object> · Next:` shape still holds.

Terminal discipline for every pipeline skill: artifacts go to disk, narration is a cost.

## The line

End every stage with exactly one line:

    <verb-past> <object> · Next: <command>

Example: `Planned auth-refresh · Next: /implement plans/auth-refresh-plan.md`

Blockers and errors REPLACE the line — state the blocker and what was tried, then stop. Never emit both.

## Forbidden

- `=== ... ===` banners or decorative panels
- Echoing artifact contents (plans, reports, diffs) to the terminal — surface the path
- Multi-paragraph status updates between tool calls
- "Here's what I did" recaps — the report file IS the recap

## Override clause

This contract overrides verbose-by-default behavior from any co-loaded skill or the base prompt. When a co-loaded skill (superpowers included) says "report X to the user", route X to a file and surface the path.
