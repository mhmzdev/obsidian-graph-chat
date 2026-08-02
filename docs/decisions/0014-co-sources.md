# 0014 — Attached notes are co-sources on the `Source:` line

- **Status:** Accepted
- **Date:** 2026-08-02
- **Confidence:** Stated by author
- **Evidence:** commit `06d25db`; author: "Essentially its a common chat
  sharing both notes' context, so we don't need to show attachments below"

## Context

Notes dragged onto a chat were originally "attached context": prompt-injected
once, shown as paperclip chips, stored only in canvas memory (lost on view
close), and drawn with a different (dotted) edge from the anchor edge.

## Decision

An attached note is a **co-source** — an equal context participant. It is
persisted as an additional wikilink on the `Source:` line, which makes it a
real graph edge in both this canvas and Obsidian's native graph. Chips were
removed; the edge *is* the UI. Link edges render identically to branch edges.
Deleting a co-source edge unlinks that note only; the first link on the line
remains the **primary** source (title, storage folder, detach semantics).

## Consequences

Shared-context chats survive reloads, and edge semantics stay reversible.
The primary/co-source asymmetry is intentional but currently one-way: there
is no gesture to promote a co-source to primary (listed in state.md "next").
Prompt injection is deduplicated across reloads by marking persisted
co-sources as already consumed — a resumed session has already read them.
