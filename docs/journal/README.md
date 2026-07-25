# Session journal

Append-only log of what each working session actually did. One file per
session, `YYYY-MM-DD-slug.md`.

This is the layer that keeps the rest honest. When `architecture.md` disagrees
with the code, the journal tells you which one drifted and when — and when an
ADR looks wrong, the journal shows what was true at the time it was written.

## What goes in an entry

Keep it short. Five headings, skip any that are empty:

```markdown
# YYYY-MM-DD — <what the session was about>

**Commits:** `abc1234`, `def5678`  ·  **Docs touched:** state.md, ADR 0010

## Done
What landed, in the user's terms, not the diff's.

## Learned
Anything discovered that was not obvious before — a surprising API behaviour,
a constraint, a dead end. This is the highest-value section: it is the part
that git cannot reconstruct.

## Decided
Choices made, each linking to its ADR if it warranted one.

## Left broken / deferred
Anything knowingly incomplete. Be specific enough that it can be picked up
cold.

## Next
The obvious next move, if there is one.
```

## Rules

- Write the entry **at the end of the session**, not incrementally.
- Never edit a past entry. Corrections go in the next entry.
- If a session produced no code but changed understanding, it still gets an
  entry — understanding is the point.
- If nothing was learned and nothing decided, one line is a fine entry. Do not
  pad.

## Entries

| Date | Entry |
| --- | --- |
| 2026-07-25 | [Knowledge base bootstrap](2026-07-25-knowledge-base-bootstrap.md) |
