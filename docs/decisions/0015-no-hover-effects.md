# 0015 — No hover-driven canvas effects; interaction feedback must not re-render

- **Status:** Accepted
- **Date:** 2026-08-02
- **Confidence:** Stated by author (removal); inferred (the general rule)
- **Evidence:** commits `9723e05` (hover flow), `9f841cd` (hover focus lens),
  `8bf0f71` (imperative rewrite), `e876b2e` (removal); author: "lets remove
  the hovering part; revert it"

## Context

Two hover features were built: hover-to-flow edges, then a native-graph-style
focus lens (hover dims everything outside the hovered + selected
neighborhoods). Routed through React state, every mouse-enter re-rendered
every node — including all mounted chat cards with their markdown — visibly
glitching the whole workspace. A rewrite moved the lens to imperative DOM
class toggles (zero re-renders), but the author chose to drop hover entirely
rather than ship the marginal version.

## Decision

Hover does nothing on the canvas. Edge flow is tap-to-pin only (selection).
The smooth cursor-anchored wheel zoom introduced in the same round
(`zoomOnScroll={false}` + rAF-eased loop in `GraphCanvas.tsx`) was kept.

The durable rule extracted from the incident: **per-frame or per-mouse-move
feedback must be CSS/DOM-only. If an interaction requires touching React
state on hover or scroll, it is designed wrong for this canvas.**

## Consequences

The canvas stays inert under the pointer, which reads as calm rather than
broken. The imperative-lens implementation exists in history (`8bf0f71`) if
hover focus is ever revisited — start from there, not from state.
