# 0008 — Wikilinks are the only edge store; canvas edits rewrite markdown

- **Status:** Accepted
- **Date:** 2026-07-25
- **Confidence:** Inferred from code
- **Evidence:** `src/graph/buildGraph.ts:51-64`,
  `src/components/GraphCanvas.tsx:36-57`, `:403-471`, `:538-569`, commit `7bfa126`

## Context

The canvas can create and destroy edges — drag a `+` onto another node to link
them, select an edge and press Delete to unlink. Those edges could live in
plugin state, or they could be the vault's actual `[[wikilinks]]`.

If they live in plugin state, the canvas becomes a second, divergent graph
sitting next to the real one, and every edge the user draws is invisible to
Obsidian, to search, and to every other tool.

## Decision

There is exactly one edge store: Obsidian's resolved link index. The graph is
read from `app.metadataCache.resolvedLinks`; edge gestures write markdown.

- Creating an edge appends `[[target]]` to the source note's `Tags:` line,
  creating that line if absent (`addLinkToTagsLine`).
- Deleting an edge strips the first matching `[[link]]` from whichever side
  has it, trying source then target (`onEdgesDelete`).
- The `metadataCache.on("resolved")` listener then re-reads the graph, so the
  canvas converges on what the files actually say.

## Consequences

**Makes easy.** Everything you draw is real. Links made here show up in the
native graph, in backlinks, in search, and in any other plugin — and links made
anywhere else show up here within 600 ms. There is no sync problem because
there is nothing to sync. Only edges classified `gc-edge` are deletable; chat
and context edges are canvas-only and cannot damage a file
(`GraphCanvas.tsx:540`).

**Makes hard.** Edge creation has an opinion about *where* the link goes — the
`Tags:` line — which is a convention of this author's vault, not of Obsidian.
Notes without that convention get one prepended. Deletion is regex surgery on
prose (`removeWikilink`), matching the first occurrence with an optional alias;
a note that links the same target twice loses the wrong one, and a link inside
a code block is not exempt.

Edges are also **undirected in the canvas but directed in the file** — the
graph collapses each pair into one edge (`buildGraph.ts:57`), so deleting it
requires guessing which file holds the link. Hence the try-source-then-target
dance and the "Link not found in either note" fallback.

**Rules out.** Canvas-only organisational edges. If a future feature wants
"these two notes are related but do not link them," it needs a different store
and this ADR needs a successor.
