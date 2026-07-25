import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Node,
  Edge,
  Connection,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  useReactFlow,
  FinalConnectionState,
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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remove the first [[link]] (with optional alias) to `base` from content. */
function removeWikilink(content: string, base: string): string {
  const re = new RegExp(` ?\\[\\[${escapeRegex(base)}(\\|[^\\]]*)?\\]\\]`);
  return content.replace(re, "");
}

function pairKey(a: string, b: string): string {
  return a < b ? a + "|" + b : b + "|" + a;
}

interface Highlight {
  nodes: Set<string>;
  edges: Set<string>;
}

function CanvasInner({
  app,
  plugin,
}: {
  app: App;
  plugin: GraphChatPlugin;
}) {
  const ctx = useMemo(() => ({ app, plugin }), [app, plugin]);
  const { screenToFlowPosition } = useReactFlow();

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
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Live sync with the vault (debounced on Obsidian's link re-index).
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

  const sessionUpdate = useCallback((nodeId: string, sessionId: string) => {
    setNodes((ns) =>
      ns.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, currentSessionId: sessionId } } : n
      )
    );
  }, []);

  /** Fork: FRESH chat window whose session continues from the fork point. */
  const forkChat = useCallback(
    (
      cardNodeId: string,
      side: BranchSide,
      snapshot: ForkSnapshot,
      posOverride?: { x: number; y: number }
    ) => {
      if (!snapshot.sessionId) {
        new Notice("Nothing to fork yet — send a message first.");
        return;
      }
      setNodes((ns) => {
        const anchor = ns.find((n) => n.id === cardNodeId);
        if (!anchor) return ns;
        const chatId = `chat-${++chatCounter}`;
        const position =
          posOverride ??
          {
            x:
              side === "left"
                ? anchor.position.x - CARD_WIDTH - 140
                : anchor.position.x + CARD_WIDTH + 140,
            y: anchor.position.y + 60,
          };
        const forkThread: ChatThread = {
          sourceNotePath: snapshot.sourceNotePath,
          sessionId: "",
          forkFromSessionId: snapshot.sessionId,
          messages: [], // fresh window — context lives in the resumed session
        };
        const chatNode: Node = {
          id: chatId,
          type: "chatCard",
          position,
          dragHandle: ".gc-drag-handle",
          data: {
            sourceNotePath: snapshot.sourceNotePath,
            initialThread: forkThread,
            anchorNodeId: cardNodeId,
            onClose: closeChat,
            onFork: (() => {}) as any, // bound below
            onSessionUpdate: (() => {}) as any,
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
      side: BranchSide = "right",
      posOverride?: { x: number; y: number }
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
        const position =
          posOverride ??
          {
            x:
              side === "left"
                ? anchor.position.x - CARD_WIDTH - 180 - (siblings.length % 2) * 60
                : anchor.position.x + 180 + (siblings.length % 2) * 60,
            y: anchor.position.y - 60 + siblings.length * 120,
          };
        const chatNode: Node = {
          id: chatId,
          type: "chatCard",
          position,
          dragHandle: ".gc-drag-handle",
          data: {
            sourceNotePath,
            initialThread,
            anchorNodeId,
            onClose: closeChat,
            onFork: (() => {}) as any, // bound below
            onSessionUpdate: (() => {}) as any,
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

  /** Saved chat notes (paths) whose Source links to this note. Synchronous. */
  const chatNotesLinkedTo = useCallback(
    (notePath: string): string[] => {
      const prefix = plugin.settings.chatsFolder + "/";
      return app.vault
        .getMarkdownFiles()
        .filter((f) => f.path.startsWith(prefix))
        .filter(
          (f) => notePath in (app.metadataCache.resolvedLinks[f.path] ?? {})
        )
        .map((f) => f.path);
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
            });
          } else {
            spawnCard(nodeId, thread.sourceNotePath, thread, false, side);
          }
        });
        return;
      }

      if (!forceNew) {
        // plain click: if the note has chats, LIGHT THEM UP instead of opening
        const chatNotes = chatNotesLinkedTo(notePath);
        const openCards = nodesRef.current.filter(
          (n) =>
            n.type === "chatCard" && (n.data as any).anchorNodeId === nodeId
        );
        if (chatNotes.length > 0 || openCards.length > 0) {
          const hNodes = new Set<string>([
            nodeId,
            ...chatNotes,
            ...openCards.map((n) => n.id),
          ]);
          const hEdges = new Set<string>([
            ...chatNotes.map((c) => pairKey(nodeId, c)),
            ...openCards.map((n) => `${nodeId}->${n.id}`),
          ]);
          setHighlight({ nodes: hNodes, edges: hEdges });
          return;
        }
        spawnCard(nodeId, notePath, undefined, false, side);
        return;
      }

      spawnCard(nodeId, notePath, undefined, true, side);
    },
    [app, spawnCard, forkChat, chatNotesLinkedTo]
  );

  // Drag a “+” onto another node → wikilink (Tags: line) or chat context.
  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      const ns = nodesRef.current;
      const src = ns.find((n) => n.id === conn.source);
      const tgt = ns.find((n) => n.id === conn.target);
      if (!src || !tgt) return;

      const card = tgt.type === "chatCard" ? tgt : src.type === "chatCard" ? src : null;
      const other = card === tgt ? src : tgt;
      if (card) {
        if (other.type === "chatCard") return;
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

      const sKind = (src.data as any).kind as VaultNodeKind;
      const tKind = (tgt.data as any).kind as VaultNodeKind;
      if (sKind === "tag" && tKind === "tag") return;

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
        });
    },
    [app]
  );

  // Drop a “+” drag on EMPTY canvas → open a chat/fork card right there.
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid) return; // landed on a node — onConnect handled it
      const fromNode = state.fromNode;
      const handleId = state.fromHandle?.id ?? "";
      if (!fromNode || !/^(plus|fork)-/.test(handleId)) return;

      const clientX =
        "clientX" in event ? event.clientX : event.changedTouches?.[0]?.clientX;
      const clientY =
        "clientY" in event ? event.clientY : event.changedTouches?.[0]?.clientY;
      if (clientX === undefined || clientY === undefined) return;

      const pos = screenToFlowPosition({ x: clientX, y: clientY });
      const side: BranchSide = handleId.endsWith("left") ? "left" : "right";
      // place the card so its connecting edge lands near the drop point
      const cardPos = {
        x: side === "left" ? pos.x - CARD_WIDTH + 20 : pos.x - 20,
        y: pos.y - 30,
      };

      const data: any = fromNode.data ?? {};
      if (fromNode.type === "chatCard") {
        const sessionId =
          (data.currentSessionId as string) ??
          (data.initialThread?.sessionId as string) ??
          "";
        forkChat(
          fromNode.id,
          side,
          {
            sourceNotePath: data.sourceNotePath,
            sessionId,
          },
          cardPos
        );
        return;
      }
      const kind = data.kind as VaultNodeKind;
      if (kind === "tag") return;
      if (kind === "chat") {
        const file = app.vault.getAbstractFileByPath(data.path);
        if (!(file instanceof TFile)) return;
        void app.vault.cachedRead(file).then((content) => {
          const thread = parseThread(data.path, content);
          if (!thread) return;
          forkChat(
            fromNode.id,
            side,
            {
              sourceNotePath: thread.sourceNotePath,
              sessionId: thread.sessionId,
            },
            cardPos
          );
        });
        return;
      }
      spawnCard(fromNode.id, data.path, undefined, true, side, cardPos);
    },
    [app, spawnCard, forkChat, screenToFlowPosition]
  );

  // Deleting a selected graph edge removes the [[wikilink]] from the note.
  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const e of deleted) {
        if (e.className !== "gc-edge") continue;
        const srcFile = app.vault.getAbstractFileByPath(e.source);
        const tgtFile = app.vault.getAbstractFileByPath(e.target);
        const srcBase = e.source.replace(/\.md$/, "").split("/").pop()!;
        const tgtBase = e.target.replace(/\.md$/, "").split("/").pop()!;
        void (async () => {
          let removed = false;
          if (srcFile instanceof TFile) {
            const c = await app.vault.cachedRead(srcFile);
            if (removeWikilink(c, tgtBase) !== c) {
              await app.vault.process(srcFile, (x) => removeWikilink(x, tgtBase));
              new Notice(`Removed [[${tgtBase}]] from ${srcFile.basename}`);
              removed = true;
            }
          }
          if (!removed && tgtFile instanceof TFile) {
            const c = await app.vault.cachedRead(tgtFile);
            if (removeWikilink(c, srcBase) !== c) {
              await app.vault.process(tgtFile, (x) => removeWikilink(x, srcBase));
              new Notice(`Removed [[${srcBase}]] from ${tgtFile.basename}`);
              removed = true;
            }
          }
          if (!removed) new Notice("Link not found in either note.");
        })();
      }
    },
    [app]
  );

  // origin notes of open chat cards get a distinct look
  const activeAnchors = useMemo(() => {
    const s = new Set<string>();
    for (const n of nodes) {
      if (n.type === "chatCard" && (n.data as any).anchorNodeId) {
        s.add((n.data as any).anchorNodeId as string);
      }
    }
    return s;
  }, [nodes]);

  const boundNodes = useMemo(
    () =>
      nodes.map((rawNode) => {
        const n = { ...rawNode, deletable: false }; // Delete key is for edges only
        const classes: string[] = [];
        if (highlight?.nodes.has(n.id)) classes.push("gc-glow");
        if (n.type !== "chatCard" && activeAnchors.has(n.id))
          classes.push("gc-anchor-active");
        const className = classes.join(" ") || undefined;
        if (n.type === "note") {
          return { ...n, className, data: { ...n.data, onStartChat: startChat } };
        }
        if (n.type === "chatCard") {
          return {
            ...n,
            className,
            data: {
              ...n.data,
              onClose: closeChat,
              onFork: forkChat,
              onSessionUpdate: sessionUpdate,
            },
          };
        }
        return { ...n, className };
      }),
    [nodes, startChat, closeChat, forkChat, sessionUpdate, highlight, activeAnchors]
  );

  const displayEdges = useMemo(
    () =>
      highlight
        ? edges.map((e) =>
            highlight.edges.has(e.id)
              ? {
                  ...e,
                  className: (e.className ?? "") + " gc-edge-glow",
                  animated: true,
                }
              : e
          )
        : edges,
    [edges, highlight]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es)),
    []
  );

  return (
    <PluginContext.Provider value={ctx}>
      <div className="gc-canvas-wrap">
        <ReactFlow
          nodes={boundNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onEdgesDelete={onEdgesDelete}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onPaneClick={() => setHighlight(null)}
          connectOnClick={false}
          deleteKeyCode={["Backspace", "Delete"]}
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

export function GraphCanvas(props: { app: App; plugin: GraphChatPlugin }) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
