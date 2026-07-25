# Architecture

**Synthesis layer** — rewritten as the code changes. Last verified against
commit `7bfa126` (Round 6).

## What this is

An Obsidian plugin (`id: graph-chat`, desktop-only) that replaces the vault
graph with an interactive canvas where **every note can be opened as a chat
with Claude**. Chats branch, fork, and link like notes do, and they persist
back into the vault as ordinary markdown.

## Runtime shape

```
Obsidian (Electron, desktop only)
 └─ GraphChatPlugin              src/main.tsx      — settings, ribbon, command
     └─ GraphChatView            src/view.tsx      — ItemView; mounts React
         └─ <GraphCanvas>        src/components/GraphCanvas.tsx
             ├─ ReactFlowProvider (@xyflow/react v12)
             ├─ <NoteNode>       chattable vault note
             ├─ <TagNode>        tag hub, never chattable
             └─ <ChatCardNode>   a live conversation
                 └─ runPrompt()  src/chat/claudeSession.ts
                     └─ child_process.spawn("claude", …)   ← the AI backend
```

The plugin is bundled by esbuild into a single `main.js` plus a concatenated
`styles.css`; `obsidian`, `electron`, and the CodeMirror packages stay external
(`esbuild.config.mjs:10-24`). React Flow's stylesheet is concatenated ahead of
ours at build time because Obsidian only ever loads one `styles.css`
(`esbuild.config.mjs:8-21`).

## The three data flows

### 1. Vault → graph (read)

`buildVaultGraph()` (`src/graph/buildGraph.ts:38`) reads
`app.metadataCache.resolvedLinks` — Obsidian's own resolved link index — and
keeps only files under `settings.includeFolders`. Node **kind** is derived
purely from the containing folder (`kindOf`, `buildGraph.ts:24`):

- under `tagsFolder` → `tag`
- under `chatsFolder` → `chat`
- otherwise → `note`

Edges are deduplicated into one undirected edge per pair; `degree` drives the
"hub" styling at ≥ 8 (`NoteNode.tsx:80`).

`layoutGraph()` (`src/graph/layout.ts:23`) runs a d3-force simulation
**synchronously to completion** and returns a static position map. There is no
live physics — the graph is laid out once at mount and then dragged by hand.

A debounced listener on `metadataCache.on("resolved")` re-runs the build every
600 ms of quiet (`GraphCanvas.tsx:111-180`), merging new vault nodes in near an
already-placed neighbour rather than re-running layout. Open chat cards are
explicitly preserved across this refresh (`GraphCanvas.tsx:122`).

### 2. Card → Claude → card (converse)

`runPrompt()` spawns the **Claude Code CLI in headless mode**, one process per
user turn:

```
claude -p <prompt> --output-format stream-json --verbose
       --allowedTools Read Glob Grep
       --disallowedTools Write Edit Bash NotebookEdit WebFetch WebSearch
       [--model <alias>] [--resume <session-id> [--fork-session]]
```

`cwd` is the **vault root**, so the vault's own `CLAUDE.md` and skills apply to
the conversation (`claudeSession.ts:5`, `ChatCardNode.tsx:172-174`). Tools are
read-only by policy — see [ADR 0005](decisions/0005-read-only-tool-policy.md).

stdout is newline-delimited JSON, parsed incrementally (`claudeSession.ts:82-95`).
Three event types matter: `system/init` carries the session id, `assistant`
carries streamed text blocks, `result` ends the turn. Non-JSON noise on stdout
is silently dropped by design.

Only the **first** message of a non-forked thread gets a context preamble
naming the anchor note (`ChatCardNode.tsx:160-162`); after that the CLI session
carries the context. Notes dragged onto a card are injected once each, tracked
by `consumedLinksRef` (`ChatCardNode.tsx:163-169`).

### 3. Card → vault (write)

`saveThread()` (`src/chat/persistence.ts:37`) writes the thread to
`<chatsFolder>/chat - <source> - <first question>.md` after **every** turn —
on send, on completion, and on error. The file format is a plain-text header
plus `## Me` / `## Claude` sections; `parseThread()` (`persistence.ts:88`) is
its inverse and is what makes a saved chat re-openable and resumable.

Because the header contains `Source: [[note]]`, chat notes are real graph
citizens: they show up in Obsidian's native graph attached to the note they
came from, and in this canvas as `kind: "chat"` nodes.

Graph edits also write markdown. Dragging a `+` from one node to another
appends `[[link]]` to the target's `Tags:` line (`GraphCanvas.tsx:37-47`);
deleting an edge removes the wikilink from whichever side holds it
(`GraphCanvas.tsx:538-569`). See
[ADR 0008](decisions/0008-wikilinks-are-the-source-of-truth.md).

## Interaction model

Everything hangs off React Flow **handles**. Each note and card carries `+`
handles on its left and right edges, which behave differently on click vs drag:

| Gesture | Result | Code |
| --- | --- | --- |
| Click a note | Open a chat — *or*, if that note already has chats, highlight them instead of opening a new one | `GraphCanvas.tsx:373-394` |
| Double-click a note | Open the note in a normal Obsidian tab | `NoteNode.tsx:89-92` |
| Click a note's `+` | Force a **new** chat on that side | `NoteNode.tsx:54-58` |
| Click a card's `+` | **Fork** the conversation into a fresh window | `ChatCardNode.tsx:213-230` |
| Drag a `+` onto another node | Write a `[[wikilink]]` between the two notes | `GraphCanvas.tsx:447-468` |
| Drag a note's `+` onto a card | Attach that note as extra context for the next turn | `GraphCanvas.tsx:411-444` |
| Drag a `+` to empty canvas | Open the new chat/fork exactly where you dropped it | `GraphCanvas.tsx:474-535` |
| Select an edge + Delete | Remove the underlying wikilink | `GraphCanvas.tsx:538` |

Note nodes are `deletable: false` — the Delete key is reserved for edges, so a
stray keystroke can never remove a note (`GraphCanvas.tsx:585`).

The click-vs-double-click ambiguity on notes is resolved with a 250 ms timer
(`NoteNode.tsx:83-88`).

## Invariants worth not breaking

1. **The vault is the database.** No chat state lives anywhere the user cannot
   see, edit, or sync. `saveThread` runs after every turn, including failures.
2. **The AI never writes to the vault.** The plugin writes; the model only
   reads. This is enforced at the CLI flag level, not in the UI.
3. **Node kind is folder-derived, never stored.** Moving a note between folders
   changes what it is. There is no metadata to keep in sync.
4. **One `claude` process per turn.** Nothing is long-lived; continuity is the
   CLI's session id, not a held connection.
5. **Chat cards are canvas-only.** They are React Flow nodes with no vault
   node behind them, and are filtered back in by hand on every vault refresh.

## Things that are *not* here yet

There is no settings UI (`main.tsx` never calls `addSettingTab`), no tests, no
linter, and no persistence of canvas positions. See `state.md` for the full
picture and `open-questions.md` for the ones that need a human decision.
