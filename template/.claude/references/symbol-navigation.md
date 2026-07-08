# Symbol navigation — search by symbol, not by text

Default to STRUCTURAL navigation over `grep`/`Glob` when the question is about a
symbol (a function, class, method, route, constant): where is it defined, where
is it used, what does a module expose. Structural search returns only real
definitions and call sites — no false hits from comments, strings, or
identically-named locals — which is exactly what "prove this is wired" needs.

## Two tools, different jobs

**`codebase-search` MCP** (`.mcp.json`, server at `.claude/tooling/codebase_search.py`) — the agent-callable symbol search. **Python source only** (AST-based). Three tools:

| Tool | Use it to |
|---|---|
| `where_is(name)` | Locate every definition of `name` (function/method/class/constant) + signature — before reading a file. |
| `find_references(name)` | Find every call/attribute/name use across the repo — to prove a dependency is wired (`find_references("get_current_user")`) or see all callers before a refactor. |
| `outline(module)` | The structured public API of one module (path or dotted name) — before adding a method or reading full source. |

Requires `uv` on PATH (it fetches the `mcp` package ephemerally). Not a Python project → this MCP is inert; rely on LSP + grep.

**LSP** (`.lsp.json`) — language servers give the agent **type-aware diagnostics** (compile/type errors surfaced automatically) across whatever languages you enable (TS, Python, Go, …). Complementary: diagnostics tell you what's *broken*, the MCP tells you where things *are*.

## The order

1. **Symbol question** (where/who-uses/what-shape) → `codebase-search` MCP if Python; else LSP-aware reading + targeted grep.
2. **Correctness signal** → let LSP diagnostics surface; don't re-derive type errors by eye.
3. **Text/pattern question** (a string literal, a config key, a TODO) → `grep`/`Glob`. That's what they're for.
4. Neither available (no `uv`, non-Python, no language server installed) → `grep`/`Glob` is the honest fallback. Say so.

Grep is not banned — it's the right tool for text. It's the wrong tool for "is this symbol actually called anywhere," where it produces false hits and misses aliased uses.
