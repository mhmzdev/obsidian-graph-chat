# 2026-08-02 — Rounds 7–14, v1.0.0 release, knowledge-base resync

**Commits:** `ffeaac3` … `856681d` (22 commits) · **Docs touched:**
all three synthesis files rewritten, ADRs 0010–0015 added, OQ-5/OQ-6 answered,
OQ-7/OQ-8 opened

## Done

Eight further UX rounds after the Round-6 snapshot the knowledge base was
written against, then the release cut:

- **R7** (`ffeaac3`): saved chats render as open chat boxes (ADR 0010); title
  rename; **canvas positions persist**; delete-confirm flow (later removed).
- Haiku **AI titles** with file rename (`0591571`).
- **R8** (`64f9e31`): solid-by-default edges that flow on selection;
  chat→chat context links; drag-branch session fix.
- **R9** (`c9a4474`): tags on chats are real `Tags:` entries; link-edge
  cleanup (the "tag only links once" bug); first same-level rule.
- **R10** (`3424042`): **standalone chats / detach-not-delete** (ADR 0011);
  model menu fixed; click never opens chats.
- **R11** (`89b9389`): **semantic zoom** folder overview; viewport culling;
  6px edge hit zones (pan fix); ✕ removed.
- **R12** (`652f5e0`): **settings tab**; chat folder routing; draggable
  folder clusters; discard ✕ for unsaved cards.
- **R13** (`826fa51`): settings UX with detected folders; **persisted branch
  levels** (ADR 0012); overview groups chats by source folder.
- **Per-folder chats** default `<folder>/Chats` (ADR 0013, `a855a3c`);
  Source-wikilink path resolution (`3ea5be8`); unmount survival (`485927b`).
- **Co-sources** (ADR 0014, `06d25db`); facing-side link edges (`35cf4f0`).
- **Hover saga** (ADR 0015): flow-on-hover (`9723e05`) → focus lens
  (`9f841cd`) → whole-canvas re-render glitch → imperative rewrite
  (`8bf0f71`) → author removed hover entirely, kept the **smooth
  cursor-anchored zoom** (`e876b2e`).
- **v1.0.0**: README (Bonscape credits), LICENSE, showcase screenshots,
  `publish:*` scripts, version-bump + tag-triggered release Action; pushed to
  `github.com/mhmzdev/obsidian-graph-chat`; draft release built by CI.

## Learned

- **The rebase invalidated every commit hash the docs cited.** Publishing to
  GitHub required rebasing onto the repo's initial commit, which rewrote all
  history: `7bfa126` (Round 6) is now `7c02127`, `5590188` is `c9fa699`, etc.
  Docs written before this entry cite the *old* hashes; they resolve only via
  reflog on the author's machine. New docs cite post-rebase hashes. If a hash
  in an ADR dated 2026-07-25 doesn't resolve, this is why — the round number
  in the commit subject is the stable key.
- **Hover feedback through React state cannot work on this canvas.** Every
  mouse-enter re-rendered all mounted chat cards. The imperative rewrite was
  sound, but the author preferred removing the feature to shipping it — rule
  extracted into ADR 0015.
- Author decisions dominated this stretch: nearly every ADR added here is
  `Stated by author`, reversing the Round-6 ratio where most were inferred.

## Left broken / open

- OQ-1 (format round-trip) grew worse: `Level:` and multi-link `Source:` are
  new unversioned fields.
- Branch parentage is not persisted (new OQ-7); provider-adapter contract
  undefined (new OQ-8).
- The 1.0.0 GitHub release is still a **draft** — author to write the
  changelog and publish; community-store PR not yet opened.
