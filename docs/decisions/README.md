# Architecture decision records

Durable choices. Append-only: to change a decision, add a new ADR and mark the
old one `Superseded by NNNN`. Never edit an accepted ADR's body — a record you
can rewrite tells you nothing about what was believed at the time.

## Index

| # | Decision | Status | Confidence |
| --- | --- | --- | --- |
| [0001](0001-claude-cli-as-backend.md) | Headless Claude Code CLI as the chat backend, not the API | Accepted | Inferred from code |
| [0002](0002-chats-are-vault-notes.md) | Chats persist as ordinary vault notes | Accepted | Stated by author |
| [0003](0003-sessions-and-forks.md) | Continuity via CLI session ids; forks via `--fork-session` | Accepted | Stated by author |
| [0004](0004-react-flow-canvas.md) | React Flow for the canvas, own d3-force layout | Accepted | Inferred from code |
| [0005](0005-read-only-tool-policy.md) | The model may read the vault, never write it | Accepted | Inferred from code |
| [0006](0006-plaintext-chat-note-header.md) | Plain-text header in chat notes, not YAML frontmatter | Accepted | Inferred from code |
| [0007](0007-folder-derived-node-kind.md) | Node kind derived from folder, never stored | Accepted | Inferred from code |
| [0008](0008-wikilinks-are-the-source-of-truth.md) | Wikilinks are the only edge store; canvas edits rewrite markdown | Accepted | Inferred from code |
| [0009](0009-per-card-model-selection.md) | Model is a per-card, per-turn choice | Accepted | Stated by author |

## Writing a new one

Copy this skeleton. Keep it short — an ADR that takes ten minutes to read will
not be read.

```markdown
# NNNN — <decision, stated as a claim>

- **Status:** Proposed | Accepted | Superseded by NNNN
- **Date:** YYYY-MM-DD
- **Confidence:** Stated by author | Inferred from code | Assumed
- **Evidence:** `src/file.ts:12-30`, commit `abc1234`, `inputs/….md`

## Context
What forced a choice. The constraint, not the feature.

## Decision
What was chosen, in one or two sentences.

## Consequences
What this makes easy, what it makes hard, and what it rules out. Be honest
about the costs — the costs are the reason a future agent will want to
reverse this, and they need to know them before they try.
```

**On the Confidence field.** *Stated by author* means a human said it.
*Inferred from code* means an agent read the implementation and reconstructed
the intent — which may be an accident nobody chose. Do not silently promote
inferred to stated; ask, then update the field and cite the answer.
