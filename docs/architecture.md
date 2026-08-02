# Architecture

**Synthesis layer** — rewritten as the code changes. Last verified against
commit `856681d` (v1.0.0 + release plumbing), 2026-08-02.

## What this is

An Obsidian plugin (`id: graph-chat`, desktop-only, **released as v1.0.0**)
that replaces the vault graph with an interactive canvas where **every note
can be opened as a chat with Claude**. Chats branch, link, and detach like
notes do, and they persist back into the vault as ordinary markdown.

## Runtime shape

```
Obsidian (Electron, desktop only)
 └─ GraphChatPlugin              src/main.tsx      — settings (+tab), positions store,
     │                                                ribbon, command, routing helpers
     └─ GraphChatView            src/view.tsx      — ItemView; mounts React
         └─ <GraphCanvas>        src/components/GraphCanvas.tsx
             ├─ ReactFlowProvider (@xyflow/react v12)
             ├─ <NoteNode>       chattable vault note
             ├─ <TagNode>        tag hub, never chattable
             ├─ <ChatCardNode>   a conversation — ALL saved chats render as these
             │   └─ runPrompt()  src/chat/claudeSession.ts
             │       └─ child_process.spawn(claudePath, …)   ← the AI backend
             └─ <FolderNode>     semantic-zoom overview card (zoom < 0.32)
```

Helpers in `src/main.tsx` are load-bearing beyond settings storage:
`isChatPath()` classifies any vault path as chat/not-chat (default folder,
routed folders, any `<folder>/Chats/` subfolder), and `resolveChatsFolder()`
decides where a new chat file lands (explicit route → per-folder `<top>/Chats`
unless opted out → default). Both are imported by the graph builder and the
canvas.

The plugin is bundled by esbuild into a single `main.js` (~720 KB) plus a
concatenated `styles.css`; `obsidian`, `electron`, and the CodeMirror packages
stay external. React Flow's stylesheet is concatenated ahead of ours at build
time because Obsidian only loads one `styles.css` (`esbuild.config.mjs`).

## The three data flows

### 1. Vault → graph (read)

`buildVaultGraph()` (`src/graph/buildGraph.ts`) reads
`app.metadataCache.resolvedLinks` and keeps files that pass `included()`:
everything when `settings.includeAll`, else the folder checklist + tags folder
+ every chat folder. Node **kind** is folder-derived (`kindOf`): tag folder →
`tag`, `isChatPath()` → `chat`, else `note`.

**Chat-kind nodes do not render as note pills.** `makeGraphNode()`
(`GraphCanvas.tsx`) gives them React Flow type `chatCard` with a `loadPath`,
so every saved chat is an always-open chat box on the canvas
([ADR 0010](decisions/0010-chats-render-as-chat-boxes.md)). A canvas-side
**meta loader** effect reads each chat note's header (`Source:`, `Level:`,
`Tags:`) into node data even while the card itself is culled off-screen —
grouping and link rules depend on it. `Source:` wikilinks are resolved to real
paths via `resolveSourcePath()` (bare `[[Note]]` links carry no folder).

`layoutGraph()` (`src/graph/layout.ts`) runs d3-force synchronously once; after
that **positions persist** in plugin data (`plugin.positions`, saved debounced
on drag-stop, restored on mount). The live-sync listener on
`metadataCache.on("resolved")` (600 ms debounce) merges vault changes in
without touching existing positions; ephemeral cards that already saved a file
suppress the file's own node (dedupe via `data.filePath`), and edges are
filtered to endpoints that exist.

### 2. Card → Claude → card (converse)

`runPrompt()` spawns the **Claude Code CLI headless**, one process per turn:

```
claude -p <prompt> --output-format stream-json --verbose
       --allowedTools Read Glob Grep
       --disallowedTools Write Edit Bash NotebookEdit WebFetch WebSearch
       [--model <id>] [--resume <session-id> [--fork-session]]
```

`cwd` is the vault root, so the vault's own `CLAUDE.md`/skills apply. Tool
policy is read-only ([ADR 0005](decisions/0005-read-only-tool-policy.md)) and
pinned in the `args` array.

The **first** message of a fresh (non-branch) thread gets a preamble naming
the anchor note **plus its full graph neighborhood — outgoing links AND
backlinks** (up to 60 paths, tags/chats excluded), because backlinks are not
discoverable from the note's own text (`ChatCardNode.tsx`, commit `2f32fd1`).
Branches skip the preamble: their context lives in the resumed session.
Co-source notes are injected once each (`consumedLinksRef`); persisted
co-sources are marked consumed on load so resumed sessions aren't re-fed.

After the first exchange, `generateTitle()` (one-shot `--model haiku`,
`--output-format json`) names the chat; the file renames to
`chat - <title>.md` via `fileManager.renameFile` (backlinks survive). A manual
rename (click the card title) does the same and always wins.

### 3. Card → vault (write)

`saveThread()` (`src/chat/persistence.ts`) writes after **every** turn — send,
completion, error. Header format (plain text, no YAML):

```
Tags: [[tag1]] [[tag2]]              (only if tagged)
Source: [[primary]] [[co-source-1]]  (only if anchored; extras are co-sources)
Session: <uuid>
Level: <n>                           (only when part of a branch tree)
Updated: YYYY-MM-DD
# <title>
## Me / ## Claude sections
```

`parseThread()` is the inverse; it feeds card hydration, the meta loader, and
unmount-survival (cards rehydrate from `loadPath` after overview swaps or
culling, commit `485927b`).

Storage location: `resolveChatsFolder()` — explicit routing rules first
(longest source-folder match), then per-folder `<folder>/Chats` (on by
default, per-folder opt-out), then the default folder
([ADR 0013](decisions/0013-per-folder-chats.md)).

Graph edits also write markdown ([ADR 0008](decisions/0008-wikilinks-are-the-source-of-truth.md)):
dragging `+` between notes appends `[[link]]` to the **`Tags:` line**
(created if missing); tags dropped on chats land in the chat's `Tags:` line
via the thread model; notes dropped on chats become **co-sources** on the
`Source:` line ([ADR 0014](decisions/0014-co-sources.md)). Edge deletion
dispatches on both `className` and endpoints
(`onEdgesDelete`, `GraphCanvas.tsx`):

| Deleted edge | Effect |
| --- | --- |
| note ↔ note (`gc-edge`) | remove the `[[wikilink]]` from whichever file holds it |
| tag ↔ chat | untag the chat (thread model persists) |
| chat ↔ its **primary** source (`gc-edge`) | **detach**: drop `Source:`, clear `Level:` → standalone orphan ([ADR 0011](decisions/0011-detach-not-delete.md)) |
| chat ↔ a **co-source** | unlink just that note |
| branch edge (`gc-edge-chat`) | visual only; child becomes an orphan (level cleared); a never-used ephemeral card is removed |
| context link (`gc-edge-link`) | clears the card's linked data so relinking works |

## Interaction model

| Gesture | Result |
| --- | --- |
| Click a note | Highlight its chats + edges (trace); **never opens a chat**; nothing if it has none |
| Double-click a note | Open the note in a normal tab |
| Click a `+` (note edge) | New chat card on that side (level 1) |
| Click a `+` (chat card edge) | **Branch**: fresh window, session resumes from branch point via `--fork-session`, level = parent+1 |
| Drag any `+` onto a node | Real `[[wikilink]]` (Tags: line) / tag / co-source, by target type |
| Drag any `+` to empty canvas | Chat/branch card lands at the drop point |
| Select edge + Delete/Backspace | See deletion table above |
| Click card title | Inline rename (persists as the note heading + filename) |
| Tap a node | Its edges flow (animated dashes) until deselected |
| Zoom out past 0.32 | Folder overview cards; drag one to move its whole cluster; click to dive in |

Same-level chat↔chat links are blocked; orphans (no level) link anywhere and
are adopted at parent+1 ([ADR 0012](decisions/0012-persisted-branch-levels.md)).

**Hover deliberately does nothing.** A hover-driven focus lens was built twice
and removed: routed through React state it re-rendered every node per
mouse-move ([ADR 0015](decisions/0015-no-hover-effects.md)). Wheel/pinch zoom
is a custom cursor-anchored rAF-eased loop (`zoomOnScroll={false}`), which is
why zooming feels continuous.

Rendering scale: `onlyRenderVisibleElements` culls off-screen nodes; semantic
zoom collapses the whole canvas into `<FolderNode>` cards grouped by the
**source note's folder** for chats (never by the physical chat folder).

## Invariants worth not breaking

1. **The vault is the database.** Every turn is saved before and after the
   reply, including on error.
2. **The AI never writes to the vault.** Enforced at the CLI flag level, in
   one place (`claudeSession.ts`).
3. **Node kind is folder-derived, never stored** — via `isChatPath`, which now
   spans multiple chat folders.
4. **One `claude` process per turn.** Continuity is the CLI session id.
5. **Edge `className` is behaviour.** `gc-edge` deletions rewrite user files;
   `gc-edge-chat` / `gc-edge-link` / `gc-edge-folder` are canvas-only.
6. **Chats can stand alone.** Detaching removes links, never history. Nothing
   in the canvas deletes a chat file; only the user can, in Obsidian.
7. **Hover must never re-render the canvas.** Interaction feedback is CSS or
   nothing.

## Release path

`npm run publish:patch|minor|major` → `npm version` runs `version-bump.mjs`
(syncs `manifest.json` + `versions.json`) → tag push triggers
`.github/workflows/release.yml` → draft GitHub release with `main.js`,
`manifest.json`, `styles.css`. Local dev deploy: `npm run deploy` (honors
`OBSIDIAN_VAULT` env var).
