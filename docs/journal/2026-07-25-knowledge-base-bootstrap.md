# 2026-07-25 — Knowledge base bootstrap

**Commits:** none yet (docs only) · **Docs touched:** everything — this is the
first entry

## Done

Set up the whole documentation system from scratch against commit `7bfa126`:

- `CLAUDE.md`, which did not exist before.
- `docs/` with the four-layer split: `inputs/`, synthesis
  (`architecture.md`, `domain.md`, `state.md`), `decisions/`,
  `open-questions.md`, plus `journal/`.
- Nine ADRs reconstructed from the code and the author's brief.
- Six open questions.
- Two inputs: the author's verbatim brief, and the three UI screenshots copied
  into `inputs/assets/` so they outlive the chat that produced them.
- `.claude/skills/doc-sync/` and `.claude/skills/plugin-dev/`, plus
  `.claude/rules/` referenced from `CLAUDE.md`.

Source of truth was a full read of all 12 files under `src/` (~1,700 lines),
the build config, and the six commits on `main`.

## Learned

- **Six of the nine ADRs are reconstructions, not records.** Only 0002, 0003,
  and 0009 trace to something the author actually said; the rest were inferred
  by reading implementations. Hence the `Confidence` field on every ADR — an
  inferred decision may be an accident of implementation that nobody chose, and
  a future agent needs to know which kind it is looking at before treating it
  as binding.
- **The tightest coupling in the codebase is the chat-note format.** It is
  simultaneously the persistence layer, the graph edge to the source note, the
  resume mechanism, and a human-readable document. That is why OQ-1 blocks
  OQ-2 and OQ-3 — three separate-looking questions all bottom out in
  `persistence.ts`.
- **Edge `className` is load-bearing, not cosmetic.** `onEdgesDelete` filters
  on `e.className !== "gc-edge"` to decide whether a delete rewrites a user's
  markdown. A refactor that treats these strings as styling would let canvas-only
  edges start editing files. Flagged in `domain.md`.
- The author's vault tags by **linking to a note under `Tags/`**, not by
  `#hashtag`. The whole tag-node concept depends on that convention, which is
  invisible from the code alone.

## Decided

Documented as ADRs 0001–0009 — see `docs/decisions/`. All are records of
choices already embodied in the code; nothing new was decided about the plugin
itself this session.

On the documentation system: the four-layer split with different write rules
per layer (append-only inputs/decisions/journal, freely-rewritten synthesis) is
the load-bearing idea. Everything else is convention.

## Left broken / deferred

- **The six inferred ADRs need author confirmation.** Each is marked
  `Confidence: Inferred from code`. Confirming one is a two-word edit; leaving
  them unconfirmed means a future agent may treat an accident as a constraint.
- **`state.md` lists seven rough edges that are recorded but unfixed** — the
  lossy chat-note parse, machine-local sessions, the module-global
  `chatCounter`, the missing error boundary, and so on. Recording them is not
  fixing them.
- **No `README.md` at the repo root.** `CLAUDE.md` covers the agent-facing
  need; a human-facing readme is a separate job and was not in scope.

## Next

1. Author reviews the six inferred ADRs and the six open questions. OQ-5
   (audience) is the cheapest to answer and unblocks the most — it decides
   whether the settings tab comes before more UX rounds.
2. Whatever ships next, end the session with `/doc-sync`. The system is only
   worth the scaffolding if entries keep landing.
