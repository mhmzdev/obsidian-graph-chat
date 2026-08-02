# Open questions

Things that would change a design if answered. Each is something an agent
should **not** silently guess at.

Conventions: `OQ-n` ids are stable and never reused. `Owner: human` means it
needs a decision only the author can make; `Owner: agent` means it can be
resolved by investigation. When answering one changes the architecture, write
an ADR and strike the question with a pointer to it.

---

## Open

### OQ-1 — How should the chat-note format survive round-tripping?
**Owner:** human · **Blocks:** any change to `persistence.ts`; per-message metadata

`parseThread` splits on `^## (Me|Claude)$`. A reply containing such a heading
re-parses into the wrong messages — reachable simply by asking Claude about
this format. There is still no format version marker, and the header has
since grown `Level:` and multi-link `Source:` lines, so the migration debt
compounds with every field. Options unchanged (escape on write / HTML-comment
delimiters / accept lossiness because the CLI session is authoritative per
[ADR 0003](decisions/0003-sessions-and-forks.md)) — but choose deliberately,
and add a version marker first.

### OQ-2 — Does the tool want per-message model attribution?
**Owner:** human · **Blocks:** [ADR 0006](decisions/0006-plaintext-chat-note-header.md) successor

Sharper now than when filed: branch-per-model comparison is the headline
feature ([ADR 0012](decisions/0012-persisted-branch-levels.md) exists to serve
it), yet a transcript cannot say which model said what. Coupled to OQ-1.

### OQ-3 — What should happen when a session id cannot be resumed?
**Owner:** human · **Blocks:** cross-device use

Chat notes sync between machines; CLI sessions do not. Failure is still a raw
error string in the card. Replay-into-fresh-session remains the only answer
that preserves the product promise, and it depends on OQ-1.

### OQ-4 — Should conversations be able to reach the web?
**Owner:** human · **Blocks:** [ADR 0005](decisions/0005-read-only-tool-policy.md) scope

`WebFetch`/`WebSearch` remain disallowed through v1.0.0. Whether *offline* is
deliberate or incidental is still unconfirmed by the author.

### OQ-7 — Should branch parentage persist, not just depth?
**Owner:** human · **Blocks:** re-attach/undo for detached branches; branch-tree views

`Level: N` records how deep a chat is, not whose child it is
([ADR 0012](decisions/0012-persisted-branch-levels.md)). After a reload, a
branch knows its depth but not its parent; after a detach, nothing can
re-attach it to the *original* parent — only orphan adoption at partner+1. A
`Parent: [[chat]]` header line would fix it but deepens the OQ-1 format debt
and dangles when the parent is renamed outside Obsidian's rename hooks.

### OQ-9 — Migrate the settings tab to Obsidian's declarative `getSettingDefinitions()` API?
**Owner:** human · **Blocks:** `main.tsx`'s settings tab; the plugin-review "Recommendation" it currently trips

Obsidian 1.13.0 added `getSettingDefinitions()` as the preferred way to build
a `PluginSettingTab`; the imperative `display()` we use is now `@deprecated`
and the review flags it. But `getSettingDefinitions()` only renders on
1.13.0+ — our `minAppVersion` is `1.7.2`, so `display()` cannot simply be
deleted; the app itself never calls the new hook on older versions. Migrating
means running two parallel implementations of the same UI (declarative for
1.13.0+, imperative fallback below it), and the dynamic parts of our tab
— the chat-routing rules list and the models checklist-plus-custom-entries —
don't map to a simple key-bound control; they need `SettingDefinitionList`
with custom `render`/`action` definitions per row, which is real UI design
work with no test suite to catch regressions. Deferred 2026-08-02 rather than
guessed at.

### OQ-8 — What is the provider-adapter contract for non-Claude CLIs?
**Owner:** human · **Blocks:** the README's headline roadmap item (Codex, Gemini, GLM)

`runPrompt()` is the seam, but the contract it assumes is Claude-shaped:
stream-json events, `--resume`/`--fork-session` semantics, read-only tool
flags, and a cheap secondary model for titles. Which of these are *required*
capabilities (a CLI without session forking cannot do branches) versus
degradable ones decides whether the adapter interface is honest or a leaky
lowest common denominator.

---

## Answered

### ~~OQ-5 — What is the intended audience?~~
**Answered 2026-08-02: public release.** The author shipped v1.0.0 with a
settings tab (commit `652f5e0`), de-personalized defaults (`claudePath:
"claude"`, `OBSIDIAN_VAULT` env for deploy), README/LICENSE, and a tagged
GitHub release pipeline (`e876b2e`). Community-store submission is on the
state.md list. The "personal tool" fork of this question is dead.

### ~~OQ-6 — Should canvas layout persist?~~
**Answered 2026-07-26: yes — positions, keyed by vault path.** Node positions
save to plugin data on drag-stop and restore on mount (commit `ffeaac3`);
folder-card cluster drags persist the same way. The "open cards too?" half
became moot when saved chats started rendering as always-open boxes
([ADR 0010](decisions/0010-chats-render-as-chat-boxes.md)) — the only
non-persistent thing left is an ephemeral card that never sent a message.
Rename-key drift remains a real hole: positions are keyed by path, so a
renamed note re-enters layout fresh.
