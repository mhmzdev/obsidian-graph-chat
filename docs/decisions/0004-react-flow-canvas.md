# 0004 — React Flow renders the canvas; layout is our own d3-force pass

- **Status:** Accepted
- **Date:** 2026-07-25
- **Confidence:** Inferred from code
- **Evidence:** `src/components/GraphCanvas.tsx:1-31`, `src/graph/layout.ts`,
  `esbuild.config.mjs:8-21`, commit `5590188`

## Context

The canvas needs pan, zoom, draggable nodes, edges that re-route, arbitrary
React inside a node (a chat card is a whole app: transcript, textarea, model
menu), and connection-dragging as a first-class gesture.

Obsidian's own graph view is canvas-drawn and closed. A hand-rolled SVG canvas
would mean reimplementing dragging, viewport transforms, and connection state.

## Decision

`@xyflow/react` v12 for the canvas and interaction layer. Node types are plain
React components (`note`, `tag`, `chatCard`), so a chat card is just a
component that happens to be positioned.

Layout is **not** React Flow's. `layoutGraph()` runs a d3-force simulation to
completion synchronously and returns a static position map; React Flow receives
already-placed nodes and never simulates.

## Consequences

**Makes easy.** Chat cards get to be real React with real DOM — Obsidian's
`MarkdownRenderer` mounts inside a node and its wikilinks work
(`ChatCardNode.tsx:61-84`). Handles give us the `+` affordance for free, and
the click-vs-drag split on a single handle is what the entire interaction model
is built on (see `domain.md`). `onConnectEnd` gives us drop-on-empty-canvas.

**Makes hard.** React Flow's stylesheet has to be concatenated into our
`styles.css` at build time, because Obsidian loads exactly one stylesheet per
plugin — hence the `css-bundle` esbuild plugin. Node data is untyped at the
React Flow boundary, so `GraphCanvas.tsx` is full of `(n.data as any)`. Every
node re-renders when the `nodes` array is rebuilt, and callbacks are rebound on
every render via `boundNodes` (`GraphCanvas.tsx:582-609`) — fine at prototype
scale, a concern at thousands of nodes.

**Static layout costs.** The graph does not settle, drift, or respond to new
edges. Nodes added by live sync are placed by a heuristic offset from a linked
neighbour rather than re-simulated (`GraphCanvas.tsx:132-158`), because
re-running the layout would throw away every position the user has dragged.
Positions are not persisted at all — see `state.md`.
