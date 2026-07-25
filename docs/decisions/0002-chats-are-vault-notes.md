# 0002 — Chats persist as ordinary vault notes, not plugin data

- **Status:** Accepted
- **Date:** 2026-07-25
- **Confidence:** Stated by author
- **Evidence:** `manifest.json` ("Chats persist as real notes"),
  `src/chat/persistence.ts:32-82`, commit `db7ac5f` ("immediate persistence")

## Context

A conversation has to live somewhere. The conventional plugin answer is
`data.json` under `.obsidian/plugins/` — invisible to the user, invisible to
search, invisible to sync-aware tooling, and invisible to the vault graph.

But the point of this plugin is that thinking-with-a-model is part of the
knowledge base, not a side channel next to it. A chat about a note is itself a
note about that note.

## Decision

Every thread is written to `<chatsFolder>/chat - <source> - <question>.md` as
plain markdown, with a `Source: [[note]]` wikilink in its header. Writing
happens after **every** turn — on send, on completion, and on error
(`ChatCardNode.tsx:157`, `:197`, `:202`).

## Consequences

**Makes easy.** Chats are searchable, editable, linkable, syncable, and
backed up by whatever the user already uses. Because the header is a wikilink,
chat notes appear in Obsidian's *native* graph hanging off the note they came
from — the feature works even with this plugin disabled. Crash safety is free:
the user's question is on disk before the reply starts streaming. Chat notes
become first-class canvas nodes (`kind: "chat"`), which is what makes
"reopen and continue" and "fork a saved chat" possible at all.

**Makes hard.** The markdown format is now a wire format with a parser
(`parseThread`), so it must round-trip. It currently does so imperfectly —
see [0006](0006-plaintext-chat-note-header.md) and
[OQ-1](../open-questions.md). Chat notes pollute the vault's file count and
the native graph for users who did not want that. Hand-edits to a chat note
are unvalidated.

**Rules out.** Storing anything conversation-critical outside the vault. In
particular, if a future feature needs per-message metadata (timestamps, token
counts, model per message), it has to fit in the markdown or be accepted as
lossy.

**Note the asymmetry with sessions.** The *transcript* is in the vault; the
*session* it resumes is in the CLI's local store. The durable half syncs, the
resumable half does not. See [OQ-3](../open-questions.md).
