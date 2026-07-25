# 0007 — A node's kind is derived from its folder and never stored

- **Status:** Accepted
- **Date:** 2026-07-25
- **Confidence:** Inferred from code
- **Evidence:** `src/graph/buildGraph.ts:24-32`, `src/main.tsx:4-17`

## Context

Three kinds of thing appear on the canvas and behave differently: chattable
notes, tag hubs (linkable but never chattable), and saved chats (reopen on
click, fork on `+`). Something has to say which is which.

The alternatives are frontmatter (`type: tag`), a naming convention, or the
folder the file sits in.

## Context, specifically about tags

Note that "tag" here means a **tag page** — a note under the `Tags/` folder
that other notes wikilink to — not an Obsidian `#hashtag`. This vault uses
link-to-a-page as its tagging mechanism, so tags are already files, already in
the link graph, and already have a folder.

## Decision

`kindOf(path, settings)` compares the path prefix against `settings.tagsFolder`
and `settings.chatsFolder`; everything else under `includeFolders` is a `note`.
Nothing about kind is written to any file.

## Consequences

**Makes easy.** Zero metadata to keep in sync, and no migration when the rules
change. Moving a file between folders reclassifies it instantly, which means
"promote this note to a tag" is a drag in the file explorer. Scoping the graph
to `includeFolders` falls out of the same mechanism, keeping the canvas to the
part of the vault that matters instead of the whole thing.

**Makes hard.** Kind is not expressible per-file — you cannot have a
non-chattable note outside `Tags/`, or a chat that lives next to its source.
The folder layout becomes load-bearing configuration: renaming `Tags/` in the
vault without updating settings silently turns every tag into a chattable note.
Since there is no settings UI yet (`state.md`), that recovery currently means
hand-editing `data.json`.

**Prefix matching is naive.** `path.startsWith(folder + "/")` means a folder
named `Tags Archive` is not matched but `Tags/old/x.md` is a tag. Nested
structure inside the configured folders is flattened into one kind.
