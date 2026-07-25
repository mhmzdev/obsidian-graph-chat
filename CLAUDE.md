# graph-chat

An Obsidian plugin that turns the vault graph into a canvas where **every note
can be opened as a chat with Claude**. Conversations branch, fork, run on
different models side by side, and persist back into the vault as ordinary
notes.

Status: **working prototype**, six UX rounds deep, one author, no tests, not
released. It runs in the author's vault and nowhere else yet.

```
Obsidian ItemView → React 18 + React Flow canvas
  ├─ note / tag / chat nodes   ← built from Obsidian's resolved link index
  └─ chat cards                → spawn `claude -p` per turn, one process, read-only
                               → every turn saved to a real markdown note
```

## Read this before you work

This project keeps a structured knowledge base in `docs/`. It exists so you can
act on what was already learned instead of re-deriving it from the diff.
**Read the layer your task touches — do not skip to the code.**

| If you are… | Read |
| --- | --- |
| Doing anything at all | `docs/state.md` — what works, what is stubbed, what is next |
| Changing code | `docs/architecture.md`, then `.claude/rules/` |
| Confused by a word (*fork* vs *branch*, *anchor*, *kind*) | `docs/domain.md` |
| About to change something that looks odd | `docs/decisions/` — it is probably deliberate |
| Wondering why something is unfinished | `docs/open-questions.md` |
| Wondering what happened last time | `docs/journal/` |
| Wanting the author's own words | `docs/inputs/` |

`docs/README.md` explains the four layers and the write rules for each. The
short version: **`inputs/`, `decisions/`, and `journal/` are append-only;
synthesis (`architecture.md`, `domain.md`, `state.md`) is rewritten freely.**

## Skills

- **`/doc-sync`** — run at the end of any substantive change. Records
  decisions, refreshes synthesis, logs the session, triages open questions.
- **`/plugin-dev`** — build, deploy, and verify in the real Obsidian app.

## Rules

- `.claude/rules/code-style.md` — TypeScript, React, CSS conventions, and the
  three things in this codebase that will bite you.
- `.claude/rules/obsidian-plugin.md` — platform constraints that are not
  discoverable from the source. Read before touching vault I/O or the view.

## Commands

```bash
npx tsc --noEmit   # the only typecheck — esbuild does NOT check types
npm run dev        # watch build into the repo (does not deploy)
npm run build      # production bundle
npm run deploy     # build + copy into the author's vault
```

## Non-negotiables

These are load-bearing. Breaking one is a product regression, not a refactor.

1. **The model never writes to the vault.** Tool policy is pinned in one place,
   the `args` array in `src/chat/claudeSession.ts`. The plugin writes; the model
   only reads. → [ADR 0005](docs/decisions/0005-read-only-tool-policy.md)
2. **The vault is the database.** Every turn is saved to a real note before and
   after the reply — including on error. No conversation state lives anywhere
   the user cannot see, edit, or sync.
   → [ADR 0002](docs/decisions/0002-chats-are-vault-notes.md)
3. **Wikilinks are the only edge store.** Drawing an edge on the canvas writes
   markdown; deleting one rewrites a file. There is no second graph.
   → [ADR 0008](docs/decisions/0008-wikilinks-are-the-source-of-truth.md)
4. **Edge `className` is behaviour, not styling.** `gc-edge` means "backed by a
   real wikilink — deleting it edits the user's note." `gc-edge-chat` and
   `gc-edge-link` are canvas-only. Renaming these for cosmetic reasons changes
   what the Delete key does to someone's vault.
5. **Never touch the filesystem directly.** `app.vault.process()` /
   `.modify()` / `.create()`. Never `fs` — it races Obsidian's own writer.
6. **`main.js` is a 690 KB build artifact.** Never read, edit, or grep it.

## Working here

- **Verify honestly.** There is no test suite and no headless way to run this.
  A successful build says nothing about whether the UI works — esbuild does not
  even typecheck. State what you actually verified and hand the rest to the
  human.
- **Six of the nine ADRs were reconstructed by reading the code**, not stated by
  the author; each carries a `Confidence` field. An inferred decision may be an
  accident nobody chose — if one is blocking you, ask rather than treating it as
  a constraint.
- **If you guessed, write it into `docs/open-questions.md`.** A guess recorded
  as a fact is the specific failure this knowledge base exists to prevent.
