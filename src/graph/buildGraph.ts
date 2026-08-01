import { App, TFile } from "obsidian";
import type { GraphChatSettings } from "../main";
import { isChatPath } from "../main";

export type VaultNodeKind = "note" | "tag" | "chat";

export interface VaultNode {
  id: string; // vault-relative path
  label: string; // basename without extension
  kind: VaultNodeKind;
  degree: number;
}

export interface VaultEdge {
  id: string;
  source: string;
  target: string;
}

export interface VaultGraph {
  nodes: VaultNode[];
  edges: VaultEdge[];
}

function kindOf(path: string, settings: GraphChatSettings): VaultNodeKind {
  if (path.startsWith(settings.tagsFolder + "/")) return "tag";
  if (isChatPath(settings, path)) return "chat";
  return "note";
}

function included(path: string, settings: GraphChatSettings): boolean {
  if (settings.includeAll) return true;
  return (
    settings.includeFolders.some((f) => path.startsWith(f + "/")) ||
    path.startsWith(settings.tagsFolder + "/") ||
    isChatPath(settings, path)
  );
}

/**
 * Build the graph from Obsidian's resolved link cache, restricted to the
 * configured folders. Tag pages become hub nodes; notes are chattable.
 */
export function buildVaultGraph(
  app: App,
  settings: GraphChatSettings
): VaultGraph {
  const files = app.vault
    .getMarkdownFiles()
    .filter((f: TFile) => included(f.path, settings));

  const paths = new Set(files.map((f) => f.path));
  const degree = new Map<string, number>();
  const edges: VaultEdge[] = [];
  const seen = new Set<string>();

  const resolved = app.metadataCache.resolvedLinks;
  for (const [source, targets] of Object.entries(resolved)) {
    if (!paths.has(source)) continue;
    for (const target of Object.keys(targets)) {
      if (!paths.has(target) || source === target) continue;
      // one edge per unordered pair
      const key = source < target ? source + "|" + target : target + "|" + source;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ id: key, source, target });
      degree.set(source, (degree.get(source) ?? 0) + 1);
      degree.set(target, (degree.get(target) ?? 0) + 1);
    }
  }

  const nodes: VaultNode[] = files.map((f) => ({
    id: f.path,
    label: f.basename,
    kind: kindOf(f.path, settings),
    degree: degree.get(f.path) ?? 0,
  }));

  return { nodes, edges };
}
