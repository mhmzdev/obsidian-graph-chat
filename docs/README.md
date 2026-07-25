# The knowledge base — read this before writing to `docs/`

This directory is the project's memory. It exists so that an agent picking up
work six weeks from now can act on what was already learned instead of
re-deriving it from the diff, or guessing.

It is organised by **how much a fact has been digested and how durable it is**,
not by topic. That is the whole idea: raw material, current synthesis, and
frozen decisions have different lifetimes and different write rules, so they
live in different places.

## The four layers

| Layer | Directory | Lifetime | Who rewrites it |
| --- | --- | --- | --- |
| **Raw inputs** | `inputs/` | Permanent, never edited | Nobody — append new files only |
| **Synthesis** | `architecture.md`, `domain.md`, `state.md` | Rewritten as the code changes | Any agent, freely |
| **Decisions** | `decisions/` | Permanent, superseded but never deleted | Append a new ADR; edit only the `Status` line of old ones |
| **Open questions** | `open-questions.md` | Churns constantly | Any agent — add, answer, promote to an ADR |

Plus `journal/` — an append-only log of what each work session actually did.
It is not synthesis; it is the audit trail that lets you reconstruct *why*
synthesis changed.

### `inputs/` — raw, undigested material

Screenshots, the user's own words describing a feature, pasted error output,
a competitor's docs, a transcript. Verbatim. If you paraphrase it, it belongs
in synthesis, not here.

Filenames are `YYYY-MM-DD-slug.md`. Binary assets go in `inputs/assets/`.

**Never edit an existing input file.** If it turns out to be wrong or was
superseded, add a new input and note the correction there. Inputs are evidence;
evidence you can rewrite is worthless.

### Synthesis — the current best understanding

- **`architecture.md`** — how the code is actually put together right now:
  the module map, the data flow, the invariants that hold. It answers *"where
  does this live and what talks to what."*
- **`domain.md`** — the vocabulary. What a *node*, *card*, *thread*, *fork*,
  *anchor* mean **in this project specifically**. It answers *"what does this
  word mean here."*
- **`state.md`** — what works, what is stubbed, what is deliberately unfinished,
  and what is next. It answers *"can I rely on this yet."*

These three are **derived**. They can and should be rewritten wholesale when
the code moves. They must not carry any fact that exists nowhere else — if a
synthesis file is the only record of something, that something belongs in an
ADR or an input.

### `decisions/` — architecture decision records

One file per durable decision, numbered `NNNN-kebab-title.md`. A decision goes
here when reversing it would mean reworking more than one module, or when a
future agent would plausibly "fix" it by accident without knowing why it is
the way it is.

ADRs are **append-only**. To change a decision, write a new ADR and set the old
one's `Status:` to `Superseded by NNNN`. Do not rewrite history — the value of
the record is that it shows what was believed at the time.

Every ADR carries an **Evidence** section pointing at the code, commit, or
input that grounds it, and a **Confidence** field distinguishing *the user said
this* from *this was inferred by reading the code*. That distinction matters:
an inferred decision may simply be an accident of implementation that nobody
ever chose, and it should be cheap for a future agent to notice that and ask.

### `open-questions.md` — the honest unknowns

Anything that would change a design if answered. Each has an ID, an owner
(usually `human` or `agent`), and what it blocks. When a question gets an
answer that changes the architecture, it graduates into an ADR and is struck
from the list with a pointer.

An empty open-questions file on a prototype is a smell, not an achievement.

### `journal/` — what happened, session by session

One file per working session, `YYYY-MM-DD-slug.md`. What was attempted, what
landed, what was learned, what was left broken. Append-only.

This is the layer that makes the rest trustworthy over time: when
`architecture.md` disagrees with the code, the journal tells you which one
drifted and when.

## Write rules for agents

1. **Read before writing.** `CLAUDE.md` → `state.md` → whichever layer your
   task touches. Do not restate what is already recorded.
2. **Record the decision, not the diff.** Git already has the diff. The
   knowledge base is for the reasoning that the diff cannot show.
3. **Cite.** Every claim in synthesis should be checkable — `src/file.ts:42`,
   a commit hash, or an input filename. Uncited claims rot silently.
4. **Prefer a new file to editing an old one** in `inputs/`, `decisions/`, and
   `journal/`. Prefer rewriting in place in synthesis.
5. **If you discover the docs are wrong, fix them in the same change** that
   proves them wrong. A stale knowledge base is worse than none, because it is
   trusted.
6. **When you are unsure, write it into `open-questions.md`** rather than
   inventing a confident answer. Guesses recorded as facts are the specific
   failure this system exists to prevent.

The `doc-sync` skill (`.claude/skills/doc-sync/`) automates steps 1–6 for the
common cases. Invoke it with `/doc-sync` at the end of a substantive change.
