# 0011 — Chats can stand alone; deleting an edge detaches, never deletes

- **Status:** Accepted
- **Date:** 2026-08-01
- **Confidence:** Stated by author
- **Evidence:** commit `3424042` (Round 10); author: "since all of our chats
  are real notes so I guess we should allow them to exist standalone except
  we'll remove the links"

## Context

An earlier round (commit `ffeaac3`) enforced "a chat cannot stand alone" with
a confirm-dialog that deleted the chat file when its link was cut. That made
the grey `Source:` edge effectively undeletable in practice and required
bookkeeping about which detachments were legal.

## Decision

Deleting any edge only ever removes the *relationship*:

- primary-source edge → drop `Source:` and `Level:` from the file (orphan)
- co-source edge → remove that one link
- branch edge → visual only; child becomes an orphan
- tag edge → untag

The chat file and its history are never touched by edge deletion. Deleting a
chat is an Obsidian-native act (delete the note), not a canvas gesture.

## Consequences

All "is this detachment allowed" logic disappeared. Orphans keep whatever
context their session already absorbed. The trade-off: nothing in the canvas
can fully delete a conversation, and a detached branch cannot find its way
back to its specific parent (only adoption by level — see ADR 0012 and OQ-7).
