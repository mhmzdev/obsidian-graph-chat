# 0010 — Saved chats render as open chat boxes, never as note pills

- **Status:** Accepted
- **Date:** 2026-07-26
- **Confidence:** Stated by author
- **Evidence:** commit `ffeaac3` (Round 7); `makeGraphNode()` in
  `src/components/GraphCanvas.tsx`; author: "we don't need them in card
  format we need to open them always in chat box format"

## Context

Through Round 6, chat notes appeared on the canvas as small accent-tinted
note cards that had to be clicked to reopen into a chat window. The author
rejected the indirection: a conversation's canvas representation *is* the
conversation.

## Decision

Every vault node of kind `chat` gets React Flow type `chatCard`. The card
lazy-loads its thread from the file (`loadPath`), auto-sizes up to ~10
messages, then scrolls. Ephemeral (unsaved) cards use `chat-N` ids; once
saved they carry `filePath` and suppress the file's own node until the next
view mount (dedupe in the live-sync refresh).

## Consequences

Chat content is always visible in place, and reopening/resuming is implicit.
The cost is DOM weight — mitigated by `onlyRenderVisibleElements` culling —
and a rehydration requirement: any unmount (culling, overview swap) must
restore the thread from disk, which is why `onSaved` also sets `loadPath`
(commit `485927b`). The dedupe seam between ephemeral cards and their files
is the most delicate code in the refresh path.
