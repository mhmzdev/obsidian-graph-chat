# 0005 — The model may read the vault; it may never write to it

- **Status:** Accepted
- **Date:** 2026-07-25
- **Confidence:** Inferred from code
- **Evidence:** `src/chat/claudeSession.ts:22-39` and its docstring
  (`:16-20`), commit `5590188`

## Context

The CLI runs with `cwd` set to the vault root and inherits the user's
environment. By default that is a fully capable agent with write and shell
access, pointed at the user's entire knowledge base, invoked by a single click
on a graph node with no confirmation step.

The plugin's UI offers no diff view, no approval prompt, and no undo. There is
nowhere for a write to be reviewed before it lands.

## Decision

Pin the toolset explicitly on every invocation:

```
--allowedTools    Read Glob Grep
--disallowedTools Write Edit Bash NotebookEdit WebFetch WebSearch
```

Vault mutation is the *plugin's* job — `saveThread`, the wikilink writer, the
edge deleter — all of which are user-initiated gestures with visible results.

## Consequences

**Makes easy.** A click on a note is unambiguously safe. No confirmation UI is
needed, which is what allows chat to be a one-click gesture on every node.
There is no path by which a prompt injected into a vault note can cause a write
to that vault.

**Makes hard.** "Ask Claude to update this note for me" is impossible by
construction. Any future write feature has to route through plugin code with
its own review step rather than through the model's tools.

**Note the second-order effect.** `WebFetch` and `WebSearch` are disallowed
too, so conversations are strictly vault-local. That is a stronger constraint
than the read-only framing implies and may not have been the intent — it is
worth confirming (see [OQ-4](../open-questions.md)).

**Enforcement is at the flag level.** It is not defence-in-depth: anything that
constructs a `runPrompt` call without going through the `args` array in
`claudeSession.ts` bypasses it entirely. Keep tool policy in that one place.
