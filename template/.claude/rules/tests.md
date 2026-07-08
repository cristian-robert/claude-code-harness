---
paths: ["**/*.test.*", "**/*.spec.*", "**/test_*.py", "**/tests/**"]
---

# Tests

- TDD is the default: write the test first (RED), run it and WATCH it fail, then implement (GREEN), then refactor. A test you never saw fail proves nothing.
- Never weaken or delete a failing test to pass a gate. If you believe the test is wrong, say so and ask.
- Test behavior, not implementation: assert on outputs and observable effects, not internal calls or private state.
- One concern per test. A name that needs "and" is two tests.
- While iterating, run only the affected test file; the full suite belongs to `/validate`.
- Never mock the thing under test. Mock boundaries only (network, clock, fs).
