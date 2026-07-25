# Project brief, in the author's words

- **Source:** Hamza, in conversation, 2026-07-25
- **Context:** Asked to set up this documentation system; described the project
  to ground it.

## Verbatim

> For now; its in-progress plugin that is kind of chat-view graph where each
> node in the graph acts as chat you can use to talk to LLMs, to brainstorm
> single idea with multiple models, you can link them; whole branching concept
> is there, you can fork out chats too.

Also stated, on what the documentation system itself is for:

> An agentic documentation system of a structured knowledge base designed so AI
> agents can reliably read, update, and act on project context over time. It
> separates raw inputs, synthesized understanding, durable decisions and open
> questions so future work can build on traceable knowledge instead of
> rediscovering or guessing.

## What this pins down

Five claims that the rest of the knowledge base treats as given:

1. **Every graph node is a chat surface.** Not a sidebar that follows
   selection — the node *is* the conversation.
2. **Multiple models on one idea is the point**, not a settings convenience.
   Grounds [ADR 0009](../decisions/0009-per-card-model-selection.md).
3. **Branching is core**, not an add-on. Grounds
   [ADR 0003](../decisions/0003-sessions-and-forks.md).
4. **Forking is distinct from branching** — the author names both separately.
   The distinction is drawn out in `domain.md`.
5. **"Kind of" and "in-progress"** — the shape is still being found. Treat
   inferred ADRs as provisional and ask rather than hardening them.

## Not covered by this brief

Audience, release intent, and how far the tool should go beyond the author's
own vault — see [OQ-5](../open-questions.md).
