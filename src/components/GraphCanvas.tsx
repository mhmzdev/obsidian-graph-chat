import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Node,
  Edge,
  Connection,
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
import { ChatCardNode, ForkSnapshot } from "./ChatCardNode";

const nodeTypes = {
  note: NoteNode,
  tag: TagNode,
  chatCard: ChatCardNode,
};

const CARD_WIDTH = 380;
let chatCounter = 0;

/** Insert a [[link]] into the note's Tags: line (create one if missing). */
function addLinkToTagsLine(content: string, linkName: string): string {
  const link = `[[${linkName}]]`;
  if (content.includes(link)) return content;
  const lines = content.split("\n");
  const idx = lines.findIndex((l) => /^Tags:/.test(l));
  if (idx >= 0) {
    lines[idx] = lines[idx].trimEnd() + " " + link;
    return lines.join("\n");
  }
  return `Tags: ${link}\n` + content;
}

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
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Live sync: when Obsidian finishes re-indexing links (new chat notes,
  // renames, deletions, new wikilinks), merge changes in without disturbing
  // the layout.
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
          const extraEdges = es.filter(
            (e) => e.className === "gc-edge-chat" || e.className === "gc-edge-link"
          );
          const graphEdges: Edge[] = graph.edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            className: "gc-edge",
          }));
          return [...graphEdges, ...extraEdges];
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

  const forkChat = useCallback(
    (cardNodeId: string, side: BranchSide, snapshot: ForkSnapshot) => {
      if (!snapshot.sessionId) {
        new Notice("Nothing to fork yet — send a message first.");
        return;
      }
      setNodes((ns) => {
        const anchor = ns.find((n) => n.id === cardNodeId);
        if (!anchor) return ns;
        const chatId = `chat-${++chatCounter}`;
        const x =
          side === "left"
            ? anchor.position.x - CARD_WIDTH - 140
            : anchor.position.x + CARD_WIDTH + 140;
        const forkThread: ChatThread = {
          sourceNotePath: snapshot.sourceNotePath,
          sessionId: "",
          forkFromSessionId: snapshot.sessionId,
          messages: snapshot.messages,
        };
        const chatNode: Node = {
          id: chatId,
          type: "chatCard",
          position: { x, y: anchor.position.y + 60 },
          dragHandle: ".gc-drag-handle",
          data: {
            sourceNotePath: snapshot.sourceNotePath,
            initialThread: forkThread,
            anchorNodeId: cardNodeId,
            onClose: closeChat,
            onFork: (() => {}) as any, // bound below
          },
        };
        setEdges((es) => [
          ...es,
          {
            id: `${cardNodeId}->${chatId}`,
            source: cardNodeId,
            sourceHandle: `fork-${side}`,
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
            onFork: (() => {}) as any, // bound below
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

  /** All saved chat threads whose Source links to this note. */
  const threadsForNote = useCallback(
    async (notePath: string): Promise<ChatThread[]> => {
      const chatsPrefix = plugin.settings.chatsFolder + "/";
      const chatFiles = app.vault
        .getMarkdownFiles()
        .filter((f) => f.path.startsWith(chatsPrefix));
      const threads: ChatThread[] = [];
      for (const f of chatFiles) {
        const links = app.metadataCache.resolvedLinks[f.path] ?? {};
        if (!(notePath in links)) continue;
        const t = parseThread(f.path, await app.vault.cachedRead(f));
        if (t) threads.push(t);
      }
      return threads;
    },
    [app, plugin]
  );

  const startChat = useCallback(
    (
      notePath: string,
      nodeId: string,
      kind: VaultNodeKind,
      forceNew = false,
      side: BranchSide = "right"
    ) => {
      if (kind === "chat") {
        // saved chat note: click → reopen thread; “+” → fork it
        const file = app.vault.getAbstractFileByPath(notePath);
        if (!(file instanceof TFile)) return;
        void app.vault.cachedRead(file).then((content) => {
          const thread = parseThread(notePath, content);
          if (!thread) {
            new Notice("Could not parse this chat note.");
            return;
          }
          if (forceNew) {
            forkChat(nodeId, side, {
              sourceNotePath: thread.sourceNotePath,
              sessionId: thread.sessionId,
              messages: thread.messages,
            });
          } else {
            spawnCard(nodeId, thread.sourceNotePath, thread, false, side);
          }
        });
      } else if (!forceNew) {
        // plain click on a note: reopen ALL its saved chats; none → new chat
        void threadsForNote(notePath).then((threads) => {
          if (threads.length === 0) {
            spawnCard(nodeId, notePath, undefined, false, side);
          } else {
            threads.forEach((t, i) =>
              spawnCard(nodeId, t.sourceNotePath, t, false, i % 2 ? "left" : side)
            );
          }
        });
      } else {
        spawnCard(nodeId, notePath, undefined, true, side);
      }
    },
    [app, spawnCard, forkChat, threadsForNote]
  );

  // Drag a “+” onto another node → create a real [[wikilink]] in the note's
  // Tags: line. Drop onto a chat card → attach the note as chat context.
  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      const ns = nodesRef.current;
      const src = ns.find((n) => n.id === conn.source);
      const tgt = ns.find((n) => n.id === conn.target);
      if (!src || !tgt) return;

      // dropping on (or dragging from) a chat card → context link
      const card = tgt.type === "chatCard" ? tgt : src.type === "chatCard" ? src : null;
      const other = card === tgt ? src : tgt;
      if (card) {
        if (other.type === "chatCard") return; // card↔card: no-op
        const notePath = (other.data as any).path as string;
        setNodes((all) =>
          all.map((n) =>
            n.id === card.id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    linkedNotes: [
                      ...(((n.data as any).linkedNotes as string[]) ?? []),
                      notePath,
                    ],
                  },
                }
              : n
          )
        );
        setEdges((es) => [
          ...es,
          {
            id: `link-${other.id}->${card.id}-${es.length}`,
            source: other.id === src.id ? conn.source! : conn.target!,
            sourceHandle: other.id === src.id ? conn.sourceHandle : undefined,
            target: card.id,
            targetHandle: "drop",
            className: "gc-edge-link",
          },
        ]);
        new Notice(`Linked ${notePath.split("/").pop()} into the chat`);
        return;
      }

      // node ↔ node → write a real wikilink into the Tags: line
      const sKind = (src.data as any).kind as VaultNodeKind;
      const tKind = (tgt.data as any).kind as VaultNodeKind;
      if (sKind === "tag" && tKind === "tag") return;

      // the tag link goes INTO the note; note→note links into the dragged-from note
      let fileNode = src;
      let linkNode = tgt;
      if (sKind === "tag" && tKind !== "tag") {
        fileNode = tgt;
        linkNode = src;
      }
      const filePath = (fileNode.data as any).path as string;
      const linkBase = ((linkNode.data as any).path as string)
        .replace(/\.md$/, "")
        .split("/")
        .pop()!;
      const file = app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;
      void app.vault
        .process(file, (content) => addLinkToTagsLine(content, linkBase))
        .then(() => {
          new Notice(`Added [[${linkBase}]] to ${file.basename} (Tags:)`);
          // real edge appears via the metadataCache refresh
        });
    },
    [app]
  );

  const boundNodes = useMemo(
    () =>
      nodes.map((n) => {
        if (n.type === "note") {
          return { ...n, data: { ...n.data, onStartChat: startChat } };
        }
        if (n.type === "chatCard") {
          return {
            ...n,
            data: { ...n.data, onClose: closeChat, onFork: forkChat },
          };
        }
        return n;
      }),
    [nodes, startChat, closeChat, forkChat]
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
          onConnect={onConnect}
          connectOnClick={false}
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
