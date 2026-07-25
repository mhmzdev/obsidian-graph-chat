# 0006 — Chat notes use a plain-text header, not YAML frontmatter

- **Status:** Accepted
- **Date:** 2026-07-25
- **Confidence:** Inferred from code
- **Evidence:** `src/chat/persistence.ts:32-36` (explicit "no YAML" comment),
  `:54-61`, `:88-114`

## Context

A chat note carries three pieces of metadata: which note it came from, which
Claude session it resumes, and when it was last touched. The Obsidian-idiomatic
place for that is YAML frontmatter.

But the source reference needs to be a **wikilink that Obsidian resolves**, so
the chat note attaches to its source in the native graph
(see [0002](0002-chats-are-vault-notes.md)). Links inside frontmatter are
resolved inconsistently and are invisible in reading view, and a note that
opens with a folded YAML block reads as machine output rather than as a
conversation.

## Decision

Three plain lines at the top of the file, then the transcript:

```markdown
Source: [[note-basename]]
Session: <session-id or "pending">
Updated: YYYY-MM-DD

# Chat — note-basename

## Me

…

## Claude

…
```

`parseThread` reverses it with two regexes and a split on `^## (Me|Claude)$`.

## Consequences

**Makes easy.** The wikilink resolves everywhere Obsidian resolves wikilinks —
native graph, backlinks pane, this plugin's own edge builder. The note reads as
a document, top to bottom, with no machine preamble. The format is obvious
enough that a user can hand-edit it without documentation.

**Makes hard.** It is a bespoke format with a bespoke parser, and the parser is
fragile in a specific and reachable way: a reply that contains a line reading
`## Me` or `## Claude` re-splits into the wrong messages. Asking Claude about
this very file format will produce exactly that. Message text has no escaping
and no fencing. See [OQ-1](../open-questions.md).

**Also lossy.** There is no per-message model, timestamp, or error record — the
`Updated:` line is whole-file and day-granular. Adding any of that means
changing the format and, therefore, breaking every chat note already written.
There is no format version marker to migrate from, which is the first thing a
successor ADR should fix.
