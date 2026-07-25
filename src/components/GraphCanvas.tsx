import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
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
import { NoteNode } from "./NoteNode";
import { TagNode } from "./TagNode";
import { ChatCardNode } from "./ChatCardNode";

const nodeTypes = {
  note: NoteNode,
  tag: TagNode,
  chatCard: ChatCardNode,
};

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

  const closeChat = useCallback((nodeId: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== nodeId));
    setEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, []);

  const spawnCard = useCallback(
    (
      anchorNodeId: string,
      sourceNotePath: string,
      initialThread?: ChatThread,
      forceNew = false
    ) => {
      setNodes((ns) => {
        const anchor = ns.find((n) => n.id === anchorNodeId);
        if (!anchor) return ns;

        // reopened threads never duplicate; plain single-click doesn't stack —
        // branching more chats off the same note goes through “+” (forceNew)
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
        const chatNode: Node = {
          id: chatId,
          type: "chatCard",
          position: {
            x: anchor.position.x + 180 + (siblings.length % 2) * 60,
            y: anchor.position.y - 60 + siblings.length * 120,
          },
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
            target: chatId,
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
      forceNew = false
    ) => {
      if (kind === "chat") {
        // saved chat note → reopen the thread, resume its session
        const file = app.vault.getAbstractFileByPath(notePath);
        if (!(file instanceof TFile)) return;
        void app.vault.cachedRead(file).then((content) => {
          const thread = parseThread(notePath, content);
          if (!thread) {
            new Notice("Could not parse this chat note.");
            return;
          }
          spawnCard(nodeId, thread.sourceNotePath, thread);
        });
      } else {
        spawnCard(nodeId, notePath, undefined, forceNew);
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
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </PluginContext.Provider>
  );
}
