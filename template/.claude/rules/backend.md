---
paths: ["**/api/**", "**/server/**", "**/*.py"]
---
<!-- TEMPLATE: adapt paths and rules to your stack during setup; every rule you keep must trace to a real failure. Delete rules that merely restate defaults. -->

# Backend rules

File-TYPE guidance: loads only when matching files are touched. Place facts (module map, local commands) belong in `<backend-dir>/CLAUDE.md`, not here. Replace the traces with yours.

- **Validate at the boundary.** Every handler parses input through the schema layer (zod/pydantic) before any logic; interior code receives typed data only. (Trace: `undefined` userId reached the DB layer.)
- **Parameterized queries only.** No string-built SQL, even for "safe" internal values. (Trace: f-string `ORDER BY` injection in report export.)
- **No secrets in code or logs.** Config via env accessors; never log request bodies on auth/payment routes. `guard.mjs` blocks `.env*` file access — log content is on you.
- **Route order: static before dynamic.** `/users/me` registers before `/users/:id`. (Trace: `"me"` parsed as an id → 500 on every profile load.)
- **Error responses use the project envelope** — `{ "error": { "code", "message" } }` with the correct status. Never raw stack traces or framework defaults to clients.
- **Migrations are additive.** Add column → backfill → cut over → drop in a LATER migration. Never rename/drop in the same deploy. (Trace: old pods raced the schema change.)
- **Handlers stay thin.** Parse → call service → shape response. Business logic lives in services, testable without HTTP. (Trace: 300-line handler nobody could unit-test.)
