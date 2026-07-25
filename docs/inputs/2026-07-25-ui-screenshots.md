# UI screenshots — Round 6 state

- **Source:** Hamza, 2026-07-25, at commit `7bfa126`
- **Assets:** `assets/2026-07-25-*.png` (copied here so they survive; do not
  edit or replace them — add new dated screenshots instead)

These are the only visual record of the UI. There is no design file and no
mockups, so treat them as the reference for what the canvas is *supposed* to
look like.

---

## 1. Fork in progress — `assets/2026-07-25-fork-card.png`

Two chat cards on the dark canvas, both titled `concept - progressive
disclosure`, connected back to a `chat - concept---progressive-disclosure-…`
node by a dashed blue edge.

**What it shows:**

- The upper card carries a **`FORK` badge** next to its title and is empty
  except for the explanatory empty state: *"Forked conversation — Claude
  remembers everything up to the fork point of concept - progressive
  disclosure. Continue from here, with any model."* This is the visible
  consequence of [ADR 0003](../decisions/0003-sessions-and-forks.md): the
  history is in the session, not the UI.
- A **paperclip chip** below the transcript reading
  `chat - concept---progress…` — an attached-context note.
- Each card has a **model picker** in the footer, and the two cards are on
  **different models** (`Haiku` above, `Opus` below) while sharing a lineage.
- Header buttons: open-chat-note (file icon) and close (×).
- The lower card shows the known model-identity wart in the wild:

  > **Me:** Which model I'm talking with
  > **Claude:** You're talking with **Sonnet 5** (model ID `claude-sonnet-5`).
  > **Me:** What about now
  > **Claude:** I'm **Haiku 4.5** (model ID `claude-haiku-4-5-20251001`). My
  > previous answer was wrong — sorry about that.

  Two turns of the *same thread* answered by different models, one of them
  wrong about its own identity. The `--model` flag is authoritative; the
  model's self-report is not. Recorded in
  [ADR 0009](../decisions/0009-per-card-model-selection.md).

## 2. Graph overview — `assets/2026-07-25-graph-overview.png`

Zoomed out. Rounded note cards (`concept - progressive disclosure`,
`concept - domain-first agent design`, `Vision Board - 2026`, `Claude Session
Insights`, `synthesis - post ideas`), grey `#pill` tag hubs (`#research`,
`#published`, `#planning`, `#agent`), and two `chat - …` nodes at the bottom.

**What it shows:**

- Tag pills are visually subordinate to notes — smaller, greyer. They are hubs,
  not content ([ADR 0007](../decisions/0007-folder-derived-node-kind.md)).
- Chat notes are real graph citizens sitting alongside notes
  ([ADR 0002](../decisions/0002-chats-are-vault-notes.md)), with long
  auto-generated names from source + first question.
- **Blue dashed edges** trace the active chat lineage from the highlighted
  `concept - progressive disclosure` node down to both chat notes; ordinary
  wikilink edges are thin and grey.
- The origin note carries the persistent **`gc-anchor-active`** highlight.

## 3. Model picker open — `assets/2026-07-25-model-picker.png`

A single card zoomed in, dropdown open over the transcript: **Sonnet** (checked,
blue), **Fable 5**, **Opus**, **Haiku** — matching `MODELS` in
`ChatCardNode.tsx:34-39`.

**What it shows:**

- Assistant replies render as **real Obsidian markdown**: bold, inline code
  (`research.md`), and accent-coloured emphasis, not plain text.
- The **`+` handles** are visible as blue circles on both the left and right
  edges of the card, mid-height — the affordance the whole interaction model
  hangs off.
- The dropdown overlays the transcript and closes on `mouseleave`.

---

## Notes for anyone changing the UI

The visual language established here — dark canvas with a dot grid, rounded
cards, blue for anything chat-related, grey for structure, dashed for
lineage — is not written down anywhere except these images and
`src/styles.css`. If you change it, add a new dated screenshot rather than
replacing these.
