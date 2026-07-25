# 0009 — The model is a per-card, per-turn choice

- **Status:** Accepted
- **Date:** 2026-07-25
- **Confidence:** Stated by author
- **Evidence:** `src/components/ChatCardNode.tsx:34-39`, `:103`, `:184`,
  `:346-375`; `inputs/2026-07-25-project-brief.md`, commit `196fb0e`

## Context

The stated purpose of the tool is to *"brainstorm a single idea with multiple
models."* A single global model setting cannot express that. Neither can a
per-thread setting, if the interesting comparison is "same conversation,
different model, from here on."

## Decision

Each chat card owns its model state, selected from a footer picker (Sonnet,
Fable 5, Opus, Haiku) and passed to the CLI as `--model` on each turn. It can
be changed mid-conversation; the next turn simply uses the new one. Nothing
about the model is stored on the thread or written to the chat note.

Combined with [0003](0003-sessions-and-forks.md), this is the core workflow:
take a conversation to an interesting point, fork it two or three times, set a
different model on each fork, and ask them all the same next question.

## Consequences

**Makes easy.** Model comparison is a UI gesture, not a configuration change.
Cheap models can drive exploration and expensive ones can be dropped in for the
hard turn, inside one thread.

**Makes hard.** The chat note records no model at all, so a saved transcript
cannot tell you who said what — a real loss for a knowledge base whose whole
premise is durable, traceable thinking. Fixing it means changing the note
format ([0006](0006-plaintext-chat-note-header.md)). Reopening a saved chat
resets the picker to the default rather than restoring the last model used
(`ChatCardNode.tsx:103`).

**Known cosmetic wart.** A model asked "which model am I?" answers from its own
priors and can answer wrong — the screenshot in
`inputs/2026-07-25-ui-screenshots.md` shows exactly that, with one reply
correcting the previous one. The `--model` flag is authoritative; the model's
self-report is not. Do not "fix" routing on the strength of a model's own
claim about its identity.

**Model list is hardcoded** in `MODELS`, with a mix of aliases (`sonnet`,
`opus`, `haiku`) and a full id (`claude-fable-5`). It will drift as models ship
and there is nothing that validates an alias before spawning.
