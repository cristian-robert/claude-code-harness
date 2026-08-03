---
type: index
folder: knowledge-base
updated: YYYY-MM-DD
tags:
  - index
---

# Knowledge base — <Project Name>

**The project-scoped store.** Everything an agent needs to know about THIS product that the code
cannot tell it. Git-tracked, reviewed in the PR, travelling with the code branch.

> [!info] Navigation — 3 reads to anything
> 1. this map · 2. the file it names · 3. the section that file names.

## Contents

- [[architecture]] — module map, `## Boundaries`, data flow. `architect-agent` writes it.
- [[decisions]] — ADRs: what was chosen and why. `architect-agent` appends.
- [[runbook]] — how to run/deploy/drive the app, plus known failure classes.
- [[resources]] — links, infra, and a credentials INDEX (pointers only, never values).
- [[inbox/_index|inbox/]] — raw project capture, untriaged.
- [[research/_index|research/]] — project research and the briefs this repo cites.

## Promoted out — pointers only

<!-- /evolve MOVES a generalized fact to the shared store and leaves ONE line here.
     Shape: - topic → `wiki/<path>` (moved YYYY-MM-DD). Never a copy of the content. -->

- _(nothing promoted yet)_

## Agent SOP

1. Read this map, then ONLY the file your question needs. Never load the whole KB.
2. Writing? Update the Contents list above in the SAME change and bump `updated:` (Index Law).
3. Generalizes past this project? Do NOT copy it to the shared store — `/evolve` MOVES it.
4. Secrets never land here. Record where a credential lives, never its value.
