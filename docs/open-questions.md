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

`parseThread` splits on `^## (Me|Claude)$` (`persistence.ts:96`). A reply
containing such a heading re-parses into the wrong messages — reachable simply
by asking Claude about this format. There is also no format version marker, so
any future change breaks every existing chat note with no migration path.

Options, roughly in increasing cost:
1. Escape or fence message bodies on write.
2. Use HTML comment delimiters (`<!-- gc:user -->`) — invisible in reading
   view, unambiguous to parse, but ugly in source.
3. Accept lossiness and treat the note as a human-readable *record* whose
   authoritative form is the CLI session.

Option 3 is closest to how the system already behaves (see
[ADR 0003](decisions/0003-sessions-and-forks.md) — the session already wins on
disagreement), but it is worth choosing deliberately rather than by default.
Whatever is chosen, add a version marker first.

### OQ-2 — Does the tool want per-message model attribution?
**Owner:** human · **Blocks:** [ADR 0006](decisions/0006-plaintext-chat-note-header.md) successor; the multi-model comparison feature

Models are chosen per turn ([ADR 0009](decisions/0009-per-card-model-selection.md))
but nothing is recorded. For a tool whose premise is comparing models, a
transcript that cannot say who said what is a real gap — but fixing it means
changing the note format, so it is coupled to OQ-1.

### OQ-3 — What should happen when a session id cannot be resumed?
**Owner:** human · **Blocks:** cross-device use; error handling in `ChatCardNode`

Chat notes sync between machines; CLI sessions do not. Sessions can also be
expired or cleared locally. Today the failure surfaces as a raw stderr string
in the card (`ChatCardNode.tsx:199-203`).

Plausible answers: detect the failure and offer to replay the transcript into a
fresh session; mark the thread read-only with a clear explanation; or silently
start fresh and warn. The first is the only one that preserves the product
promise, and it depends on OQ-1 — replay needs a reliable parse.

### OQ-4 — Should conversations be able to reach the web?
**Owner:** human · **Blocks:** [ADR 0005](decisions/0005-read-only-tool-policy.md) scope

`WebFetch` and `WebSearch` are in `--disallowedTools` alongside the write
tools. Read-only is clearly deliberate; whether *offline* is deliberate or
incidental is not clear from the code. Enabling them is a one-line change but
widens the prompt-injection surface — a vault note could then direct the model
to fetch a URL.

### OQ-5 — What is the intended audience?
**Owner:** human · **Blocks:** settings UI, release path, defaults

Defaults are hardcoded to the author's vault and CLI path (`main.tsx:12-17`),
and `deploy.mjs` targets one absolute directory. If this stays a personal tool,
much of `state.md`'s "next" list is unnecessary. If it is meant to be shared,
the settings tab is the first blocker and should come before further UX rounds.

### OQ-6 — Should canvas layout persist?
**Owner:** human · **Blocks:** layout work; [ADR 0004](decisions/0004-react-flow-canvas.md) follow-up

Positions are recomputed by force layout on every mount and open cards are
lost on view close. Arranging a workspace is currently throwaway effort. If it
should persist, the open question underneath is *what* persists — positions
only, or open cards too, and keyed by what when notes are renamed.

---

## Answered

*(none yet — when a question is answered, move it here with the answer, the
date, and a link to the ADR or commit that settled it)*
