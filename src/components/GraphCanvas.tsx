import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  applyNodeChanges,
  NodeChange,
} from "@xyflow/react";
import type { App } from "obsidian";
import type GraphChatPlugin from "../main";
import { buildVaultGraph } from "../graph/buildGraph";
import { layoutGraph } from "../graph/layout";
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
        onStartChat: (() => {}) as any, // bound below via closure state
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

  const startChat = useCallback(
    (notePath: string, nodeId: string) => {
      setNodes((ns) => {
        const anchor = ns.find((n) => n.id === nodeId);
        if (!anchor) return ns;
        const chatId = `chat-${++chatCounter}`;
        const chatNode: Node = {
          id: chatId,
          type: "chatCard",
          position: {
            x: anchor.position.x + 120,
            y: anchor.position.y - 60,
          },
          dragHandle: ".gc-drag-handle",
          data: { sourceNotePath: notePath, onClose: closeChat },
        };
        setEdges((es) => [
          ...es,
          {
            id: `${nodeId}->${chatId}`,
            source: nodeId,
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

  // bind the callback into note node data (stable via useMemo above)
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
          <MiniMap pannable zoomable className="gc-minimap" />
        </ReactFlow>
      </div>
    </PluginContext.Provider>
  );
}
