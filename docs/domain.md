# Domain model & vocabulary

**Synthesis layer.** These words are used precisely throughout the code and the
docs. When they collide with a generic meaning (React Flow also says "node";
Obsidian also says "graph"), the definition below wins.

## Core objects

**Vault node** — a markdown file that appears on the canvas. Identified by its
vault-relative path, which doubles as its React Flow node id. Three **kinds**,
derived entirely from the containing folder:

- **note** — anything chattable. The default.
- **tag** — a page under `tagsFolder`. Renders as a `#pill` hub. Never
  chattable; exists to be linked *to*. Dragging a tag's `+` onto a note tags
  that note.
- **chat** — a saved conversation under `chatsFolder`. Clicking it reopens the
  thread; `+` forks it.

**Chat card** — a live conversation window floating on the canvas. A React Flow
node of type `chatCard` with **no file behind it**. Closing a card does not
delete anything; the thread is already on disk.

**Thread** (`ChatThread`, `src/chat/persistence.ts:8`) — the conversation data:
its source note, its Claude session id, its messages, and once saved, its file
path. The durable form of a card.

**Anchor** — the vault node a card hangs off (`anchorNodeId`). Drives where the
card spawns, which edge connects it, and the "origin highlight" styling on the
note itself. A fork's anchor is the *card* it forked from, not the note.

**Source note** — the note a thread is *about* (`sourceNotePath`). Written into
the saved chat as `Source: [[…]]`. A fork inherits its parent's source note, so
a whole fork tree stays attached to one note in the native Obsidian graph.

## Conversation concepts

**Turn** — one user message and the assistant reply it produces. Exactly one
`claude -p` process. There is no persistent connection between turns.

**Session** — the Claude Code CLI's own conversation state, addressed by a
session id. The plugin stores the id; the CLI stores the transcript. Continuity
is `--resume <id>`.

> The session lives in the CLI's local store on **this machine**, outside the
> vault. Chat notes sync between devices; the sessions they point at do not.
> See [OQ-3](open-questions.md).

**Fork** — a new conversation that inherits everything up to a point, then
diverges. Implemented as `--resume <parent> --fork-session`, which gives the
child its own session id on its first turn while leaving the parent untouched.

The card opens **empty**, not pre-filled with the parent's messages: the
context lives inside the resumed session, not in the UI. That empty state is
deliberate and is explained in the card itself
(`src/components/ChatCardNode.tsx:278-283`).

**Branch** — the looser, user-facing word for opening *another* chat on the
same note. Branches are independent conversations that share a subject; forks
share a history. Both render as extra cards; only forks carry the `FORK` badge.

**Attached context** (`linkedNotes`) — notes dragged onto a card. Each is named
in the prompt once, the first turn after it is attached, then never again
(`consumedLinksRef`). They render as paperclip chips under the transcript.

## Model selection

Each card carries its own model, chosen per turn from a footer picker: Sonnet,
Fable 5, Opus, Haiku (`ChatCardNode.tsx:34-39`). The value is passed straight
through as the CLI's `--model` alias.

Switching mid-conversation is supported and intentional — the same thread can
be continued by a different model, which is the point of the whole tool: one
idea, several models, side by side. See
[ADR 0009](decisions/0009-per-card-model-selection.md).

> A model asked "which model are you?" answers from its own priors, not from
> the flag, so it can answer wrong. This is captured in the screenshot in
> `inputs/2026-07-25-ui-screenshots.md` and is a known cosmetic wart, not a
> routing bug.

## Canvas gestures

**`+` handle** — the blue circle on a node's left and right edge. Click and
drag mean different things (see `architecture.md`), and both are load-bearing.

**Side** (`BranchSide`, `"left" | "right"`) — which edge a gesture came from.
Determines which side the new card appears on and which handles the connecting
edge uses, so branching left grows the canvas leftward.

**Highlight** — clicking a note that already has chats lights up the note, its
saved chat notes, and its open cards instead of opening anything. The "show me
what I've already asked about this" gesture.

**Origin highlight** — the persistent styling on a note that currently has an
open card (`gc-anchor-active`), distinct from the transient click highlight.

## Naming conventions in code

- CSS classes are `gc-` prefixed, all of them, in one `src/styles.css`.
- Edge `className` is meaningful, not cosmetic — it is how edges are classified:
  `gc-edge` (real wikilink, deletable → rewrites markdown), `gc-edge-chat`
  (note → card), `gc-edge-link` (attached context). Changing one of these
  strings changes behaviour, notably in `onEdgesDelete`.
- Handle ids encode intent: `plus-left`, `fork-right`, `drop`, `from-right`.
  `onConnectEnd` pattern-matches on `/^(plus|fork)-/` to decide whether a drop
  on empty canvas should spawn anything (`GraphCanvas.tsx:479`).
