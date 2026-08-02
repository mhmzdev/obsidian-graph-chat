# Project state

**Synthesis layer.** What you can rely on today, what is deliberately rough,
and what comes next. Verified against commit `856681d`, 2026-08-02.

**Maturity: released.** v1.0.0 is tagged; the GitHub Action has drafted the
release (publish pending the author adding a changelog). Fourteen UX rounds
across 2026-07-25 → 2026-08-02, all with the author as the only user so far.
Still no tests.

## Works

| Capability | Notes |
| --- | --- |
| Vault graph on a React Flow canvas | Include-all or folder checklist; positions persist across sessions |
| Chat from any note via `+` | First message carries the note + its full graph neighborhood (links **and backlinks**) |
| Saved chats render as open chat boxes | Always; auto-size to ~10 messages then scroll; rehydrate after culling/overview swaps |
| Branching with shared memory | `--fork-session`; fresh window; levels persisted (`Level: N`); CHAT/BRANCH chips |
| Standalone (orphan) chats | Detach = unlink, never delete; orphans link anywhere, adopted at parent+1 |
| Canvas-as-editor | Drag `+` → wikilink (Tags: line) / tag a chat / co-source into a chat; edge delete reverses each |
| Co-sources | Persisted on the `Source:` line; shared-context chats across several notes |
| AI titles | Haiku one-shot after first exchange; file renames; manual rename wins |
| Per-folder chat storage | `<folder>/Chats` default with opt-outs; explicit routing rules; multiple chat folders everywhere |
| Settings tab | CLI path, models (toggles + custom + default), folders (all/checklist), routing table, per-folder toggles |
| Per-card model picker | From settings; switchable mid-thread |
| Semantic zoom | Folder cards < 0.32 zoom, grouped by source folder; cluster drag; count-weighted edges |
| Performance | Viewport culling; smooth cursor-anchored zoom; tap-to-flow only (hover deliberately inert) |
| Release pipeline | `npm run publish:*` → tag → Action → draft release; README + LICENSE + showcase shipped |

## Known rough edges

1. **Chat notes are a lossy round-trip** — unchanged since Round 6. A reply
   containing `## Me` / `## Claude` mis-parses; no format version marker
   ([OQ-1](open-questions.md)). The header has since gained `Level:` and
   multi-link `Source:` — the migration debt grows with each field.
2. **Sessions are machine-local** ([OQ-3](open-questions.md)). Resume on
   another device fails as a red error string in the card.
3. **Branch lineage is only depth, not parentage.** `Level: N` survives
   reloads but *who* the parent was does not — an orphaned level-2 chat can't
   be re-attached to its original parent specifically ([OQ-7](open-questions.md)).
4. **Unsent input dies with an unmount.** A card that never sent a message has
   no file; culling or overview swap loses typed-but-unsent text.
5. **`chatCounter` is module-global**; two Graph Chat views in one window
   would share it. Unchanged.
6. **No error boundary**; a render throw in one card blanks the canvas.
   Unchanged.
7. **First-run UX depends on PATH.** Default `claudePath` is `"claude"`;
   Obsidian's GUI environment often lacks the user's shell PATH, so the first
   experience for a new user may be a spawn error until they set the absolute
   path in settings. Surfaced in the card, documented in the README, still a
   stumble.
8. **Model attribution is not recorded** per message ([OQ-2](open-questions.md))
   — unchanged, and more visible now that model-comparison via branches is the
   headline feature.

## What's next

1. **Publish the 1.0.0 draft release** (author: changelog + button).
2. **Community plugin store submission** — PR to `obsidianmd/obsidian-releases`.
3. **Provider adapters** (Codex, Gemini, GLM CLIs) behind the `runPrompt`
   seam — the README promises "Claude Code only for now" ([OQ-8](open-questions.md)).
4. **Promote a co-source to primary** — the one missing move in the
   detach/attach model.
5. **Harden the chat-note format** before more fields accrete ([OQ-1](open-questions.md)).
6. GIF showcase items for the README (static PNGs shipped).

Anything here that turns into a real design choice should become an ADR, not a
line item.
