---
name: ui-quality-pass
description: Use when building or changing screens, components or forms; checks states, responsiveness, keyboard use, accessibility and basic performance by looking at the real interface.
---

# UI quality pass

Code that compiles is not an interface that works. Open it and use it.

## Check by running the app

1. **All states.** Loading, empty, error, success, partial, long text, zero and many items, slow network, offline. Each should look intentional.
2. **Forms.** Labels tied to inputs, validation messages next to the field, disabled state while submitting, no double submit, preserved input on error.
3. **Keyboard.** Every action reachable with Tab and Enter/Space, visible focus ring, logical order, Escape closes dialogs, focus returns where it started.
4. **Semantics.** Real `button`, `a`, `label`, headings in order, landmarks. `alt` on meaningful images, empty `alt` on decorative ones.
5. **Contrast and size.** Text contrast of at least 4.5:1 (3:1 for large text), tap targets about 44px, no information conveyed by color alone.
6. **Responsive.** Check at about 360px, 768px and 1280px wide. No horizontal scroll, no overlapping elements, readable line length.
7. **Motion.** Respect `prefers-reduced-motion`. No animation that blocks interaction.
8. **Console and network.** No errors or warnings in the console; no failed requests; images sized and lazy-loaded where appropriate.
9. **Performance basics.** No huge unoptimized images, no layout shift on load, no long main-thread tasks from your change.

## Tools

Use a real browser or the project's browser-testing tool when available. Run an accessibility checker (axe or Lighthouse) and treat its results as a floor, not a pass.

## Rules

- Match the existing design system and components. Do not introduce a second one.
- Do not claim a UI works from reading the JSX. State what you actually looked at and at which sizes.
