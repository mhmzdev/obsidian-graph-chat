# 0001 — The chat backend is the headless Claude Code CLI, not the Anthropic API

- **Status:** Accepted
- **Date:** 2026-07-25
- **Confidence:** Inferred from code
- **Evidence:** `src/chat/claudeSession.ts:21-52`, commit `5590188`

## Context

The plugin needs to talk to a model from inside Obsidian. Two obvious routes:
call the Anthropic API over HTTP with a user-supplied key, or shell out to the
Claude Code CLI the user already has installed.

The tool's value proposition is *vault-aware* conversation — the model should
be able to read the note, follow its wikilinks, and search the vault. Doing
that over the raw API means building file-reading tool definitions, a tool-use
loop, context assembly, and a token budget by hand.

## Decision

Spawn `claude -p` as a child process per turn, with `cwd` set to the vault
root, and consume its `--output-format stream-json --verbose` output.

## Consequences

**Makes easy.** Vault reading, globbing, and grep come free as CLI tools. The
vault's own `CLAUDE.md` and skills apply to every conversation automatically,
because the CLI is running *inside* the vault. Auth is the user's existing
Claude Code login — no key handling, no key storage, no billing surface in the
plugin. Session persistence and forking are the CLI's problem, not ours
(see [0003](0003-sessions-and-forks.md)).

**Makes hard.** Desktop only, forever — `child_process` does not exist on
Obsidian mobile, hence `isDesktopOnly: true` in the manifest. The CLI's path
must be known; it is currently a hardcoded default pointing at the author's
install (`src/main.tsx:13`). Process-per-turn means startup latency on every
message. Errors surface as exit codes and stderr text rather than structured
API errors (`claudeSession.ts:101-113`).

**Rules out.** Any web or mobile port. Any deployment where the user does not
have a Claude Code subscription and CLI installed.

**Reversal cost.** Moderate and contained: `runPrompt()` is a single 116-line
module with a callback interface (`onText` / `onDone` / `onError`) that an API
client could satisfy. The hard part is not the transport — it is that
`--resume`, `--fork-session`, and free vault tools would all need
reimplementing, and forking is load-bearing for the product concept.
