# Project state

**Synthesis layer.** What you can rely on today, what is deliberately rough,
and what comes next. Verified against commit `7bfa126`, 2026-07-25.

**Maturity: working prototype.** Six rounds of UX iteration in one day, all on
`main`, no tests, no releases. It runs in the author's vault and nowhere else
yet.

## Works

| Capability | Notes |
| --- | --- |
| Vault graph on a React Flow canvas | Folder-scoped, force-laid-out once at mount |
| Click a note → chat with Claude about it | Vault-aware; the model reads the note and its links |
| Streaming replies rendered as real Obsidian markdown | Wikilinks inside replies are clickable and open the note |
| Chats persist as vault notes after every turn | Survives crashes; the chat note is written before the reply arrives |
| Reopen a saved chat and continue it | Session resumed from the id in the note header |
| Fork a conversation into a fresh window | Parent untouched; child gets its own session on first turn |
| Multiple chats per note, left and right | Plus the highlight gesture to find existing ones |
| Per-card model picker, switchable mid-thread | Sonnet / Fable 5 / Opus / Haiku |
| Drag `+` between nodes → write a real `[[wikilink]]` | Lands on the note's `Tags:` line |
| Delete an edge → remove the wikilink | Checks both sides |
| Drag a note onto a card → attach it as context | Injected once, shown as a chip |
| Drop a `+` on empty canvas → card lands there | Works for both new chats and forks |
| Live re-sync when the vault changes | Debounced 600 ms; open cards preserved |

## Deliberately not built yet

- **No settings UI.** `GraphChatSettings` exists and is loaded/saved, but
  `main.tsx` never calls `addSettingTab`, so the only way to change
  `claudePath`, `chatsFolder`, `includeFolders`, or `tagsFolder` is to edit
  `data.json` by hand. The defaults are hardcoded to the author's vault
  (`src/main.tsx:12-17`).
- **No canvas persistence.** Positions come from a fresh force layout on every
  mount, and open cards vanish when the view closes. Closing the tab loses your
  workspace arrangement — though never a conversation.
- **No tests, no linter, no CI.** `package.json` has `dev`, `build`, `deploy`
  and nothing else.
- **No release path.** `deploy.mjs` hardcodes one absolute vault path
  (`deploy.mjs:4-6`); there is no BRAT manifest, no `versions.json`, no
  GitHub release workflow.
- **No mobile support.** `isDesktopOnly: true` — the plugin spawns a child
  process, which rules mobile out structurally.

## Known rough edges

Ranked by how likely they are to bite. None is currently blocking use.

1. **Chat notes are a lossy round-trip.** `parseThread` splits on `^## (Me|Claude)$`
   (`persistence.ts:96`), so a reply that itself contains such a heading — easy,
   when asking Claude about this very format — will be re-parsed into the wrong
   number of messages. Editing a chat note by hand is likewise unguarded.
2. **Sessions are machine-local.** A chat note synced to another device carries
   a session id the local CLI has never heard of. Resume will fail there.
   Failure mode is currently an unstyled error string in the card.
3. **Positions of newly-appeared vault nodes are guesswork.** The live-sync path
   places them at a fixed offset from a linked neighbour with a `% 4` spread
   (`GraphCanvas.tsx:143-149`), so a burst of new notes stacks up.
4. **`chatCounter` is a module-level global** (`GraphCanvas.tsx:34`). Fine with
   one view open; two views in the same window would share the counter.
5. **StrictMode double-invokes effects** (`view.tsx:35`). Harmless today because
   nothing spawns a process on mount, but the first effect that does will
   double-fire in dev.
6. **No error boundary.** A render throw in one card takes the whole canvas
   down to a blank pane.
7. **`onFork`'s declared type takes three arguments** (`ChatCardNode.tsx:29`)
   while the implementation accepts an optional fourth (`posOverride`). The
   drag-to-empty path passes it and works; the type just under-describes it.

## What's next

No committed roadmap — the project moves in UX rounds. The candidates that keep
surfacing, in rough order of value:

1. **Settings tab**, so the plugin can run in a vault other than the author's.
   Also the prerequisite for anyone else trying it.
2. **Persist canvas layout** (positions + open cards) to plugin data, keyed by
   vault node path.
3. **Harden the chat-note format** against round-trip loss — see
   [OQ-1](open-questions.md).
4. **Multi-model side-by-side on one prompt** — the "brainstorm one idea with
   several models" use case is currently manual: fork, switch model, re-ask.
5. **Release path** so it can be installed by someone who is not the author.

Anything here that turns into a real design choice should become an ADR, not a
line item.
