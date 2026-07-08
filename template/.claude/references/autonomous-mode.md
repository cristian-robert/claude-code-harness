# Autonomous mode — the ONLY two activation paths

Autonomous mode removes the human from PO priority, sprint scope, and Stakeholder
acceptance decisions. It is NEVER self-inferred.

Active when — and only when — one of:

1. `.claude/harness.json` has `"autonomous": true` (set by the operator or a loop driver,
   never by a skill), or
2. the invoking prompt explicitly declares it (the loop PROMPT template carries the line
   "This session is autonomous").

Absent both → every human gate applies: block on the ASK, never approximate the answer.

While active, every decision a human would have made is logged under `## Assumptions`
(item file, plan, or sprint file — whichever artifact the deciding skill owns), and
`/accept` may approve ONLY when every criterion is PASS with evidence.
