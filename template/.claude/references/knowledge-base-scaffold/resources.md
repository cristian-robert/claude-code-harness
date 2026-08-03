---
type: note
project: <Project Name>
updated: YYYY-MM-DD
tags:
  - resources
---

# Resources — <Project Name>

Where everything lives: the deploys, the dashboards, and POINTERS to credentials.

## Links

| What | Where |
|---|---|
| Production | <url> |
| Staging | <url> |
| CI / CD | <url> |
| Issue tracker | <url> |
| Design / docs | <url> |

## Infrastructure

- **Hosting:** <provider>
- **Database:** <engine and where it runs>
- **Domains / DNS:** <registrar>
- **Third-party services:** <list>

## Credentials INDEX

> [!danger] Pointers only — this file is git-tracked and may be published
> Record **where** a credential lives, never the value itself. `kb-check` fails the gate on one.
> A pointer that itself looks secret-shaped is waived one line at a time by appending
> `<!-- kb-check:allow -->` to that line; the waiver is visible in the diff.

| Credential | Lives in | Notes |
|---|---|---|
| <name, e.g. deploy key> | <1Password vault / platform manager> | <rotation cadence> |

## External references

- <spec, contract, or doc this product is built against>
