# 0003 — Continuity is a CLI session id; forking uses `--fork-session`

- **Status:** Accepted
- **Date:** 2026-07-25
- **Confidence:** Stated by author
- **Evidence:** `src/chat/claudeSession.ts:43-46`,
  `src/components/ChatCardNode.tsx:185-186`, `:191-194`, commit `4c04483`

## Context

Two problems, one mechanism.

*Continuity:* one process per turn means nothing is held in memory between
messages. The conversation has to be re-established each time.

*Branching:* the product concept is exploring one idea down several paths —
take a conversation to turn five, then ask three different follow-ups, or the
same follow-up of three different models, without any of them contaminating
the others.

Replaying the whole transcript into each new process would work for continuity
and would be wrong for branching: it re-pays for context on every turn, and it
loses whatever the model did with its tools along the way.

## Decision

Store the CLI's session id on the thread. Resume with `--resume <id>`.
Fork with `--resume <parent-id> --fork-session`, which produces a **new**
session seeded with the parent's history and leaves the parent untouched.

A forked card opens with an **empty** message list. Its history is inside the
resumed session, not in the UI. The first turn carries `forkSession: true`;
once the CLI hands back the child's own id it becomes an ordinary thread
(`ChatCardNode.tsx:186`, `:193`).

## Consequences

**Makes easy.** Forking is one flag rather than a context-copying subsystem.
Fork trees are cheap, which is what lets the UI offer a `+` on both sides of
every card. A fork can use a different model from its parent while inheriting
its full history — the "brainstorm one idea with several models" case.

**Makes hard.** Session ids are opaque and machine-local; see
[OQ-3](../open-questions.md). Session state can be garbage-collected or lost
by the CLI independently of the vault, and the plugin cannot detect that until
a resume fails. The empty forked card needs an explanatory empty state, since
"Claude remembers things I cannot see" is not otherwise discoverable
(`ChatCardNode.tsx:278-283`).

**Rules out.** Editing history. There is no way to rewrite a turn and replay —
the transcript in the note is a *record* of the session, not its source of
truth. If the note and the session disagree, the session wins silently.
