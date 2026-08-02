# Obsidian plugin constraints

Platform facts that shape the code. Most of these are not discoverable from
the source and are expensive to relearn.

## Build and load

- Obsidian loads exactly **three files** from the plugin directory:
  `main.js`, `manifest.json`, `styles.css`. Anything else you emit is ignored.
  That is why React Flow's stylesheet is concatenated into ours at build time
  (`esbuild.config.mjs:8-21`) rather than imported.
- Output is **CJS**, target `es2020`. `obsidian`, `electron`, the CodeMirror
  packages, and Node builtins are external — they are provided by the host.
- `main.js` is committed to `.gitignore` but **present in the working tree**;
  it is the build artifact, ~720 KB. Do not read it, do not edit it, do not
  grep it — it is bundled React.
- `npm run dev` starts esbuild in watch mode. It does **not** deploy. See the
  `plugin-dev` skill for the full loop.

## API rules that matter here

- **Never touch the filesystem directly.** `app.vault.process(file, fn)` for
  read-modify-write, `app.vault.modify()` for whole-file replacement,
  `app.vault.create()` for new files. `process` holds Obsidian's lock;
  `fs` does not, and racing Obsidian's own writer corrupts files.
- `app.vault.cachedRead()` for reads you are only going to display or parse —
  it is the cached path. `app.vault.read()` only when you need bytes on disk.
- Paths must be run through `normalizePath()` before use.
- `app.metadataCache.resolvedLinks` is the resolved link index, keyed by source
  path, valued by a map of target path → count. It is **only correct after the
  `resolved` event**; reading it during startup gives partial data. This is why
  the graph subscribes to `metadataCache.on("resolved")` rather than polling.
- Always `app.metadataCache.offref(ref)` in the effect cleanup. Leaked
  listeners survive view close and fire against unmounted React.
- `MarkdownRenderer.render()` needs a `Component` that you `load()` and
  `unload()` yourself, or its child components leak
  (`ChatCardNode.tsx:69-80`).
- `setIcon(el, name)` gives you Obsidian's bundled Lucide set — do not add an
  icon dependency.

## Desktop-only

`isDesktopOnly: true` in the manifest. This is structural, not a preference:
the plugin spawns `child_process`, which does not exist in Obsidian mobile's
runtime. Any feature that would work on mobile is still blocked by this, and
removing it means replacing the entire chat backend
([ADR 0001](../../docs/decisions/0001-claude-cli-as-backend.md)).

## Views

- `GraphChatView extends ItemView`. `onOpen` mounts a React root into
  `this.contentEl`; `onClose` must `unmount()` it or React keeps rendering into
  a detached tree.
- The view is registered in `onload` and Obsidian may restore it on startup
  before the vault is fully indexed — do not assume `resolvedLinks` is
  populated at mount.
- `StrictMode` is on (`view.tsx:35`), so effects double-invoke in dev builds.
  Anything with a side effect on mount must be idempotent.

## Settings

`GraphChatSettings` is loaded and saved (`main.tsx:53-59`) but there is **no
settings tab** — `addSettingTab` is never called. The only way to change
settings today is editing `data.json` in the plugin directory by hand. Adding
the tab is `state.md`'s first "next" item and is a prerequisite for anyone
other than the author running this.
