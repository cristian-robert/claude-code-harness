---
paths: ["**/*.tsx", "**/*.jsx", "**/components/**"]
---
<!-- TEMPLATE: adapt paths and rules to your stack during setup; every rule you keep must trace to a real failure. Delete rules that merely restate defaults. -->

# Frontend rules

File-TYPE guidance: loads only when matching files are touched. Place facts (dir layout, local commands) belong in `<frontend-dir>/AGENTS.md`, not here. Each rule below shows the shape — specific, imperative, traceable — replace the traces with yours.

- **Server components by default.** Add `"use client"` only for state, effects, or browser APIs — never "just in case". (Trace: 14 needless client components, +80KB bundle.)
- **Design tokens, never raw hex.** `var(--color-*)` / theme scale only; raw values live in one tokens file. (Trace: hardcoded `#3B82F6` in 9 files broke the rebrand.)
- **Loading, error, and empty states ship WITH the component.** A data component missing any of the three is incomplete, not "a follow-up".
- **Interactive means keyboard-reachable.** Real `<button>`/`<a>`, visible focus ring, `aria-label` on icon-only controls. (Trace: `onClick` on a `<div>` failed the a11y audit.)
- **Size media up front.** Explicit `width`/`height` or `aspect-ratio` on every image/video. (Trace: CLS regression from an unsized hero image.)
- **No new dependency for what the platform does.** Modals → `<dialog>`, tooltips → CSS, dates → `Intl`. (Trace: 3 date libs in one bundle.)
- **Shared component only at the third consumer.** Copy twice first; premature extraction froze the wrong API. (Trace: `GenericCard` with 11 props.)
