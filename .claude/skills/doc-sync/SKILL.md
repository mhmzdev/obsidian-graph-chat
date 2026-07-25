---
name: doc-sync
description: Update the docs/ knowledge base after a change — record decisions as ADRs, refresh the synthesis layer, log the session in the journal, and triage open questions. Use at the end of any substantive change, when the user says "update the docs", or when you notice docs/ has drifted from the code.
---

# doc-sync

Keep `docs/` true. Read `docs/README.md` first if the four-layer split is not
already in context — the write rules per layer are the whole point and they
differ.

This is a **triage** skill, not a "write documentation" skill. Most sessions
touch one or two layers. Writing all of them every time produces noise, and
noise is what kills a knowledge base.

## Decide what actually changed

Run through these in order. Skip anything that does not apply — an empty
section is better than a padded one.

### 1. Did a durable choice get made? → ADR

A choice is durable if **reversing it would touch more than one module**, or if
a future agent would plausibly "fix" it by accident without knowing why it is
that way.

Not every change is a decision. Adding a button is not. Choosing to store
button state in the vault instead of plugin data is.

If yes: next number in `docs/decisions/`, template in
`docs/decisions/README.md`, then add the row to that file's index table. Set
`Confidence` honestly — `Stated by author` only if a human actually said it.

If the new ADR replaces an old one, set the old one's `Status:` to
`Superseded by NNNN`. **Do not edit its body.**

### 2. Did the code's shape change? → synthesis

- New module, changed data flow, changed invariant → `docs/architecture.md`
- New concept or a word used in a specific way → `docs/domain.md`
- Something started working, broke, or got deliberately deferred →
  `docs/state.md`

Rewrite these in place. Update the "verified against commit" line at the top of
`architecture.md` and the date on `state.md`.

Cite as you go — `src/file.ts:42`, a commit hash, or an input filename. An
uncited claim in the synthesis layer is indistinguishable from a guess.

### 3. Did something become clearer, or murkier? → open questions

- A question got answered → move it to the **Answered** section with the
  answer, the date, and a link to the ADR or commit that settled it. Do not
  delete it; the id must stay resolvable.
- Something new is unclear → add `OQ-n` with an owner and what it blocks.
- Never renumber. Ids are permanent.

**If you found yourself guessing during the work, that guess is an open
question.** Recording it is the single highest-value thing this skill does.

### 4. Did the user say something quotable? → inputs

Verbatim requirements, screenshots, pasted errors, external references. New
file, `YYYY-MM-DD-slug.md`, never edit an existing one. Copy binary assets into
`docs/inputs/assets/` so they outlive the conversation. Add the row to
`docs/inputs/README.md`.

### 5. Always → journal

One entry per session, `docs/journal/YYYY-MM-DD-slug.md`, template in
`docs/journal/README.md`. Add the row to that file's index table.

The **Learned** section is the one that matters. Git records what changed; only
the journal records what you found out. A surprising API behaviour, a dead end,
a constraint you discovered the hard way — that is the content. If the session
produced code but no journal entry, the session's understanding is lost.

Sessions that produced no code but changed understanding still get an entry.

## Then check for drift

Before finishing, scan for the docs having gone stale beneath you:

- Do the file:line citations in the files you touched still point at the right
  thing? Line numbers move.
- Does `state.md`'s "Works" table still match reality?
- Is anything in `open-questions.md` already answered by the code?

Fix drift in the same change that revealed it. A stale knowledge base is worse
than none, because it is trusted.

## What not to do

- Do not restate the diff. Git has the diff.
- Do not create an ADR for a routine change. Nine ADRs cover a whole project;
  if you are writing your third this session, most of them are not decisions.
- Do not promote `Confidence: Inferred from code` to `Stated by author` without
  the author actually stating it. That field exists precisely to stop
  reconstructions from hardening into constraints.
- Do not touch `main.js`. It is a 690 KB build artifact.

## Finish

Report to the user, briefly: which layers you touched and why, plus anything
you deliberately left out. If you added an open question, say so explicitly —
it may be something they can answer in one line.
