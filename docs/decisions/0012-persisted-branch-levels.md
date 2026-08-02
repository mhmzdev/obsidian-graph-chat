# 0012 — Branch depth persists in the note as `Level: N`

- **Status:** Accepted
- **Date:** 2026-08-01
- **Confidence:** Stated by author
- **Evidence:** commit `826fa51` (Round 13); author: "Maybe we should keep
  L1 L2 ... LN in chat notes somewhere so that even after detached we'd know
  its last level was"

## Context

The rule "same-level chats can't be linked" was first computed by walking the
canvas anchor chain — which exists only in session memory, so every reloaded
chat counted as level 1 and the rule misfired.

## Decision

Persist depth in the chat note header: `Level: 1` for a chat opened from a
note, parent+1 for branches. Parse it on load (the canvas meta loader reads
it even for culled cards). Detaching removes the line; a chat without a level
is an **orphan** that may link to any chat and is adopted at partner+1.

## Consequences

The level rule survives restarts and works on cards that never rendered. Depth
is recorded but **parentage is not** — `Level:` says how deep, not whose child
(OQ-7). Legacy chats without the line are treated as orphans, which was
accepted as the migration story.
