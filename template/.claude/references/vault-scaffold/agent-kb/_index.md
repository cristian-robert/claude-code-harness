---
type: index
folder: agent-kb
updated: 2026-07-06
tags:
  - index
---

# agent-kb

**Evergreen knowledge domain for building AI agents.** Reusable across every agent project — this is what your individual agents (which live in `projects/`) draw from. Agent-building expertise compounds here.

> [!note] agent-kb vs projects
> A specific agent *product* → `projects/<name>/` (its own wiki). Reusable, cross-project agent know-how → here.

## Contents

- [[agent-kb/prompts/_index|prompts/]] — reusable system prompts + prompt patterns.
- [[agent-kb/evals/_index|evals/]] — eval sets, results, remembered regressions.
- [[agent-kb/models/_index|models/]] — model notes: capabilities, pricing, quirks, when-to-use.
- [[agent-kb/patterns/_index|patterns/]] — agent architectures (tool loops, RAG, multi-agent, memory).
- [[agent-kb/tooling/_index|tooling/]] — MCP servers, frameworks, SDK references.

## Agent SOP

1. Building or debugging an agent? Check `patterns/`, `models/`, and `tooling/` before designing from scratch.
2. New reusable learning about agents → file it in the matching subfolder and **update that subfolder's `_index.md`** (Index Law).
3. Keep entries model-and-vendor-agnostic where possible; note version/date since this space moves fast.
