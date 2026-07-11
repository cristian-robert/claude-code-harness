<!-- TEMPLATE: adapt paths and rules to your stack during setup; every rule you keep must trace to a real failure. Delete rules that merely restate defaults. -->
<!-- Copy to <backend-dir>/CLAUDE.md. Lazy-loads only when Claude reads a file under this directory — zero context cost otherwise. The split: .claude/rules/*.md with paths: = file-TYPE guidance across the whole tree (any *.py anywhere); a subdirectory CLAUDE.md = guidance about a PLACE (this dir's layout, commands, local traps). Never duplicate type rules here. -->
# <backend-dir>

| Dir | Responsibility |
|---|---|
| `routes/` | HTTP layer: parse request, call service, shape envelope — no logic |
| `services/` | Business logic; the only layer allowed to touch repositories |
| `repositories/` | DB access; all SQL/ORM lives here |
| `schemas/` | Request/response models — single source of validation truth |
| `jobs/` | Background workers; enqueued from services, never from routes |

## Local commands

| Task | Command |
|---|---|
| Run this service | `<cmd>` |
| Tests (this dir only) | `<cmd>` |
| New migration | `<cmd>` |

## Gotchas (each traces to a real failure)

- `services/billing.py` mutations need an idempotency key — double-charge incident.
- Tests silently hit staging unless `<LOCAL_ENV_VAR>` is set — check before running.
- `conftest.py` truncates tables between tests — never point it at a shared DB.
