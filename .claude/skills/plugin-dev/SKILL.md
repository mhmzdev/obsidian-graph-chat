---
name: plugin-dev
description: Build, deploy, and verify this Obsidian plugin. Use when asked to build, run, deploy, test a change in the real app, or when a change needs to be seen working in Obsidian. Covers the watch/deploy loop, how to reload the plugin, and what can and cannot be verified without a human.
---

# plugin-dev

The build/deploy/verify loop for the `graph-chat` Obsidian plugin.

## The honest constraint, first

**There is no test suite and no headless way to run this.** It is an Obsidian
plugin that spawns the Claude CLI; it only truly runs inside the Obsidian
desktop app, in the author's vault.

So verification splits in two:

| You can verify alone | Only the human can verify |
| --- | --- |
| It compiles (`tsc --noEmit`) | It renders correctly |
| It bundles (`npm run build`) | The gesture feels right |
| Logic you can reason about | Chats actually stream |
| Deployment landed | Forking works end to end |

Never report a UI change as "working" on the strength of a successful build.
Say what you verified and hand the rest to the human explicitly.

## Commands

```bash
npm run dev      # esbuild watch → main.js + styles.css. Does NOT deploy.
npm run build    # one-shot production bundle
npm run deploy   # build, then copy main.js/manifest.json/styles.css to the vault
npx tsc --noEmit # typecheck — esbuild does NOT typecheck, so this is the only check
```

`npx tsc --noEmit` is the important one. esbuild strips types without checking
them, so **a build passing means nothing about type correctness**. Run the
typecheck after any non-trivial edit.

## The loop

1. Edit under `src/`.
2. `npx tsc --noEmit` — must be clean.
3. `npm run deploy` — bundles and copies into the vault plugin directory.
4. Ask the human to reload: **Cmd+P → "Reload app without saving"** in
   Obsidian. Toggling the plugin off/on in Settings → Community plugins also
   works and is faster.
5. Ask them what they see.

`npm run dev` is for a tight editing session, but note it writes into the repo,
not the vault — you still need `npm run deploy` (or a manual copy) for the
change to reach Obsidian.

## Deploy target

`deploy.mjs` copies to a **hardcoded absolute path**:

```
<author's Google Drive>/Obsidian/My Vault/.obsidian/plugins/graph-chat
```

If deploy fails with ENOENT, the vault has moved or is not synced — do not
"fix" it by inventing a path. Ask. Making this configurable is tracked as
[OQ-5](../../../docs/open-questions.md).

## Before you change anything

Read `.claude/rules/obsidian-plugin.md`. The platform constraints there —
vault API instead of `fs`, the `resolved` event timing, the three-file load
contract, `Component` lifecycle for `MarkdownRenderer` — are the source of most
bugs in this codebase and none of them are discoverable from the source.

## Watch out for

- **`main.js` is a committed build artifact**, ~690 KB of bundled React. Never
  read, edit, or grep it. If a search hits it, exclude it.
- **The plugin spawns processes.** A change to `claudeSession.ts` can leave
  orphaned `claude` processes if the cancel path breaks. `runPrompt` returns a
  killer function and `ChatCardNode` calls it on unmount
  (`ChatCardNode.tsx:123`) — keep that contract.
- **Tool policy lives in exactly one place**, the `args` array in
  `claudeSession.ts`. Anything that spawns the CLI elsewhere bypasses the
  read-only guarantee
  ([ADR 0005](../../../docs/decisions/0005-read-only-tool-policy.md)).
- **StrictMode double-invokes effects** in dev. Mount side effects must be
  idempotent.
- **Styles are global.** Every class needs the `gc-` prefix or it leaks into
  the user's whole Obsidian UI.

## Debugging inside Obsidian

Cmd+Opt+I opens Electron devtools. React devtools do not work. `console.log`
from plugin code appears there. The Claude CLI's stderr is captured into
`stderrBuf` and surfaced in the card on non-zero exit
(`claudeSession.ts:107-113`) — it does not reach the console, so add a log if
you need it during development.

## When you are done

If the change was substantive, run `/doc-sync` before finishing.
