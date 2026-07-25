import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Node,
  Edge,
  applyNodeChanges,
  NodeChange,
} from "@xyflow/react";
import { TFile, Notice } from "obsidian";
import type { App } from "obsidian";
import type GraphChatPlugin from "../main";
import { buildVaultGraph, VaultNodeKind } from "../graph/buildGraph";
import { layoutGraph } from "../graph/layout";
import { parseThread, ChatThread } from "../chat/persistence";
import { PluginContext } from "./PluginContext";
import { NoteNode, BranchSide } from "./NoteNode";
import { TagNode } from "./TagNode";
import { ChatCardNode } from "./ChatCardNode";

const nodeTypes = {
  note: NoteNode,
  tag: TagNode,
  chatCard: ChatCardNode,
};

const CARD_WIDTH = 380;
let chatCounter = 0;

export function GraphCanvas({
  app,
  plugin,
}: {
  app: App;
  plugin: GraphChatPlugin;
}) {
  const ctx = useMemo(() => ({ app, plugin }), [app, plugin]);

  const initial = useMemo(() => {
    const graph = buildVaultGraph(app, plugin.settings);
    const pos = layoutGraph(graph);
    const nodes: Node[] = graph.nodes.map((n) => ({
      id: n.id,
      type: n.kind === "tag" ? "tag" : "note",
      position: pos[n.id],
      data: {
        label: n.label,
        path: n.id,
        degree: n.degree,
        kind: n.kind,
        onStartChat: (() => {}) as any, // bound below
      },
    }));
    const edges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      className: "gc-edge",
    }));
    return { nodes, edges };
  }, [app, plugin]);

  const [nodes, setNodes] = useState<Node[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);

  // Live sync: when Obsidian finishes re-indexing links (new chat notes,
  // renames, deletions), merge changes in without disturbing the layout.
  useEffect(() => {
    let timer: number | null = null;
    const refresh = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        const graph = buildVaultGraph(app, plugin.settings);
        setNodes((ns) => {
          const byId = new Map(ns.map((n) => [n.id, n]));
          const inGraph = new Set(graph.nodes.map((g) => g.id));
          // keep chat cards; keep known nodes (with fresh degree/kind); drop deleted
          const result: Node[] = ns
            .filter((n) => n.type === "chatCard" || inGraph.has(n.id))
            .map((n) => {
              if (n.type === "chatCard") return n;
              const g = graph.nodes.find((g) => g.id === n.id)!;
              return {
                ...n,
                type: g.kind === "tag" ? "tag" : "note",
                data: { ...n.data, degree: g.degree, kind: g.kind, label: g.label },
              };
            });
          // add brand-new notes next to a linked neighbor when possible
          for (const g of graph.nodes) {
            if (byId.has(g.id)) continue;
            const link = graph.edges.find(
              (e) =>
                (e.source === g.id && byId.has(e.target)) ||
                (e.target === g.id && byId.has(e.source))
            );
            const anchor = link
              ? byId.get(link.source === g.id ? link.target : link.source)
              : undefined;
            const base = anchor?.position ?? { x: 0, y: 0 };
            result.push({
              id: g.id,
              type: g.kind === "tag" ? "tag" : "note",
              position: {
                x: base.x + 30 + (result.length % 4) * 40,
                y: base.y + 150,
              },
              data: {
                label: g.label,
                path: g.id,
                degree: g.degree,
                kind: g.kind,
                onStartChat: (() => {}) as any,
              },
            });
          }
          return result;
        });
        setEdges((es) => {
          const chatEdges = es.filter((e) => e.className === "gc-edge-chat");
          const graphEdges: Edge[] = graph.edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            className: "gc-edge",
          }));
          return [...graphEdges, ...chatEdges];
        });
      }, 600);
    };
    const ref = app.metadataCache.on("resolved", refresh);
    return () => {
      app.metadataCache.offref(ref);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [app, plugin]);

  const closeChat = useCallback((nodeId: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== nodeId));
    setEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, []);

  const spawnCard = useCallback(
    (
      anchorNodeId: string,
      sourceNotePath: string,
      initialThread?: ChatThread,
      forceNew = false,
      side: BranchSide = "right"
    ) => {
      setNodes((ns) => {
        const anchor = ns.find((n) => n.id === anchorNodeId);
        if (!anchor) return ns;

        const siblings = ns.filter(
          (n) =>
            n.type === "chatCard" && (n.data as any).anchorNodeId === anchorNodeId
        );
        const dup = ns.find(
          (n) =>
            n.type === "chatCard" &&
            (initialThread?.filePath
              ? (n.data as any).initialThread?.filePath === initialThread.filePath
              : !forceNew &&
                (n.data as any).sourceNotePath === sourceNotePath &&
                !(n.data as any).initialThread)
        );
        if (dup) return ns;

        const chatId = `chat-${++chatCounter}`;
        const x =
          side === "left"
            ? anchor.position.x - CARD_WIDTH - 180 - (siblings.length % 2) * 60
            : anchor.position.x + 180 + (siblings.length % 2) * 60;
        const chatNode: Node = {
          id: chatId,
          type: "chatCard",
          position: { x, y: anchor.position.y - 60 + siblings.length * 120 },
          dragHandle: ".gc-drag-handle",
          data: {
            sourceNotePath,
            initialThread,
            anchorNodeId,
            onClose: closeChat,
          },
        };
        setEdges((es) => [
          ...es,
          {
            id: `${anchorNodeId}->${chatId}`,
            source: anchorNodeId,
            sourceHandle: side === "left" ? "plus-left" : "plus-right",
            target: chatId,
            targetHandle: side === "left" ? "from-right" : undefined,
            animated: true,
            className: "gc-edge-chat",
          },
        ]);
        return [...ns, chatNode];
      });
    },
    [closeChat]
  );

  const startChat = useCallback(
    (
      notePath: string,
      nodeId: string,
      kind: VaultNodeKind,
      forceNew = false,
      side: BranchSide = "right"
    ) => {
      if (kind === "chat" && !forceNew) {
        // saved chat note, plain click → reopen the thread, resume its session
        const file = app.vault.getAbstractFileByPath(notePath);
        if (!(file instanceof TFile)) return;
        void app.vault.cachedRead(file).then((content) => {
          const thread = parseThread(notePath, content);
          if (!thread) {
            new Notice("Could not parse this chat note.");
            return;
          }
          spawnCard(nodeId, thread.sourceNotePath, thread, false, side);
        });
      } else {
        // fresh chat anchored to this note (works for chat notes too — the
        // new session reads the old conversation as its source context)
        spawnCard(nodeId, notePath, undefined, forceNew, side);
      }
    },
    [app, spawnCard]
  );

  const boundNodes = useMemo(
    () =>
      nodes.map((n) =>
        n.type === "note"
          ? { ...n, data: { ...n.data, onStartChat: startChat } }
          : n
      ),
    [nodes, startChat]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    []
  );

  return (
    <PluginContext.Provider value={ctx}>
      <div className="gc-canvas-wrap">
        <ReactFlow
          nodes={boundNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          fitView
          minZoom={0.05}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} />
        </ReactFlow>
      </div>
    </PluginContext.Provider>
  );
}
