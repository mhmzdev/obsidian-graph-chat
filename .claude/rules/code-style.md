# Code style

Conventions this codebase actually follows. Match them; do not import habits
from elsewhere.

## TypeScript

- **Strict-ish, not strict.** `noImplicitAny` and `strictNullChecks` are on;
  full `strict` is not (`tsconfig.json`). Do not turn it on as a drive-by —
  it is a separate change with its own fallout.
- `type` imports are marked: `import type { App } from "obsidian"`.
- Interfaces for data shapes, not types. Every exported interface that leaves a
  module gets a one-line doc comment where the name is not self-explanatory.
- `(n.data as any)` casts at the React Flow boundary are **expected**, not
  sloppiness — React Flow's `NodeProps` is not generic over our data. Each node
  component narrows once at the top (`const d = data as ChatCardData`) and uses
  the typed local thereafter. Follow that shape rather than casting inline
  repeatedly.

## React

- Function components, hooks only. No classes.
- `useCallback` for anything passed into node `data`; `useMemo` for derived
  node/edge arrays. The canvas rebuilds these on every render, so an unstable
  callback re-renders every node.
- **State that the UI reads goes in `useState`; state that callbacks read goes
  in a ref.** `ChatCardNode` keeps the whole thread in `threadRef` and mirrors
  only `messages` into state, because the streaming callbacks fire outside the
  render cycle. `GraphCanvas` keeps `nodesRef` in sync for the same reason.
- Mutating `threadRef.current.messages` then calling
  `setMessages([...thread.messages])` is the established streaming pattern. It
  is deliberate — do not "fix" it into immutable updates without checking that
  streaming still coalesces correctly.

## Comments

Sparse and load-bearing. This codebase comments **why**, never what:

```ts
// Obsidian only loads styles.css — bundle React Flow's base styles with ours.
// fresh window — context lives in the resumed session
// Delete key is for edges only
```

If a comment restates the code, delete it. If a line would surprise a reader
six months from now, comment it. Module-level docstrings on the non-obvious
modules (`claudeSession.ts`, `persistence.ts`, `layout.ts`, `buildGraph.ts`)
explain the module's contract in 2–4 lines — keep that up for new modules.

## CSS

- One file, `src/styles.css`, concatenated after React Flow's at build time.
- **Every class is `gc-` prefixed.** No exceptions — the stylesheet is injected
  into Obsidian's global scope and will collide otherwise.
- Use Obsidian's CSS variables (`--background-primary`, `--text-muted`,
  `--interactive-accent`) so the plugin follows the user's theme. Do not
  hardcode colours; the dark look in the screenshots is the *theme*, not us.
- Sections are separated by `/* ---------- name ---------- */` banners.

## Things that will bite you

- **Edge `className` is behaviour.** `gc-edge` means "backed by a real
  wikilink, deleting it rewrites a file." `gc-edge-chat`, `gc-edge-link`, and
  `gc-edge-folder` are canvas-only. `onEdgesDelete` dispatches on this string
  AND on endpoint node types (primary source vs co-source vs tag). Renaming
  these classes for styling reasons changes what the Delete key does to the
  user's vault.
- **Handle ids are parsed**, not just labels: `onConnectEnd` matches
  `/^(plus|fork)-/` and reads the `left`/`right` suffix.
- **Node paths are node ids.** A vault node's React Flow id *is* its
  vault-relative path. Renaming a note changes its id.
- All vault writes go through `app.vault.process()` (read-modify-write under
  Obsidian's lock) or `app.vault.modify()`. Never `fs`.
