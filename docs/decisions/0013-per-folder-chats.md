# 0013 — Chats live with their notes: `<folder>/Chats` by default

- **Status:** Accepted
- **Date:** 2026-08-02
- **Confidence:** Stated by author
- **Evidence:** commit `a855a3c`; author: "keep chat of each folder in its
  own e.g. by default Chats/ to all folders found and user can then toggle
  off the ones they want"

## Context

All chats initially landed in one root `Chats/` folder. The author's model is
that chats belong to the notes they came from — including on disk.

## Decision

`resolveChatsFolder()` resolves storage in strict order:

1. explicit routing rule (longest source-folder prefix match, settings table)
2. per-folder default `<top-folder>/<Chats>` — on for every folder, opt-out
   toggles in settings; subfolder name follows the default folder's basename
3. the root default folder (also the home for source-less chats)

`isChatPath()` centralizes detection across all three shapes and feeds graph
build, inclusion, and chat scanning. Existing files are never moved.

## Consequences

Chat notes sit next to their subject matter, and Obsidian-native folder
operations (move, rename) keep working because detection is path-shaped, not
registry-based. The zoom-out overview deliberately groups chats by their
*source note's* folder rather than their physical folder, so nested `Chats/`
folders never appear as cards; only orphans surface the root Chats card.
