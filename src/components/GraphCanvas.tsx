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
  useStore,
  FinalConnectionState,
} from "@xyflow/react";
import { TFile, Notice } from "obsidian";
import type { App } from "obsidian";
import type GraphChatPlugin from "../main";
import { allChatFolders } from "../main";
import { buildVaultGraph, VaultNodeKind, VaultNode } from "../graph/buildGraph";
import { layoutGraph } from "../graph/layout";
import { ChatThread, parseThread } from "../chat/persistence";
import { PluginContext } from "./PluginContext";
import { NoteNode, BranchSide } from "./NoteNode";
import { TagNode } from "./TagNode";
import { ChatCardNode, ForkSnapshot } from "./ChatCardNode";
import { FolderNode } from "./FolderNode";

const nodeTypes = {
  note: NoteNode,
  tag: TagNode,
  chatCard: ChatCardNode,
  folder: FolderNode,
};

const CARD_WIDTH = 380;
/** below this zoom the canvas collapses into folder overview cards */
const OVERVIEW_ZOOM = 0.32;
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
  const { screenToFlowPosition, setCenter } = useReactFlow();
  // semantic zoom: far out → folder overview (boolean selector = re-render
  // only when crossing the threshold, not on every zoom frame)
  const zoomedOut = useStore((s) => s.transform[2] < OVERVIEW_ZOOM);
  // saved chats the user hid this session (✕) — live sync won't re-add them
  const closedChatsRef = useRef<Set<string>>(new Set());

  const makeGraphNode = useCallback(
    (g: VaultNode, position: { x: number; y: number }): Node => {
      if (g.kind === "chat") {
        // saved chats live on the canvas as full chat boxes
        return {
          id: g.id,
          type: "chatCard",
          position,
          dragHandle: ".gc-drag-handle",
          data: {
            sourceNotePath: g.id, // real source resolves after load
            loadPath: g.id,
            filePath: g.id,
            onClose: (() => {}) as any, // bound later
            onFork: (() => {}) as any,
            onSessionUpdate: (() => {}) as any,
            onSaved: (() => {}) as any,
            onTagsLoaded: (() => {}) as any,
          },
        };
      }
      return {
        id: g.id,
        type: g.kind === "tag" ? "tag" : "note",
        position,
        data: {
          label: g.label,
          path: g.id,
          degree: g.degree,
          kind: g.kind,
          onStartChat: (() => {}) as any,
        },
      };
    },
    []
  );

  const initial = useMemo(() => {
    const graph = buildVaultGraph(app, plugin.settings);
    const pos = layoutGraph(graph);
    const nodes: Node[] = graph.nodes.map((n) =>
      makeGraphNode(n, plugin.positions[n.id] ?? pos[n.id])
    );
    const ids = new Set(nodes.map((n) => n.id));
    const edges: Edge[] = graph.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        className: "gc-edge",
      }));
    return { nodes, edges };
  }, [app, plugin, makeGraphNode]);

  const [nodes, setNodes] = useState<Node[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // ---- canvas position persistence ----
  const saveTimerRef = useRef<number | null>(null);
  const persistPositions = useCallback(() => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      for (const n of nodesRef.current) {
        if (n.id.includes("/") || n.id.endsWith(".md")) {
          plugin.positions[n.id] = { x: n.position.x, y: n.position.y };
        }
      }
      void plugin.savePositions();
    }, 400);
  }, [plugin]);

  // Live sync with the vault (debounced on Obsidian's link re-index).
  useEffect(() => {
    let timer: number | null = null;
    const refresh = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        const graph = buildVaultGraph(app, plugin.settings);
        const current = nodesRef.current;
        // chat notes already represented by an ephemeral (chat-N) card
        const ephemeralPaths = new Set(
          current
            .filter((n) => n.type === "chatCard" && !n.id.includes("/"))
            .map((n) => (n.data as any).filePath as string | undefined)
            .filter(Boolean)
        );
        const skipChat = (id: string) =>
          ephemeralPaths.has(id) || closedChatsRef.current.has(id);
        const finalIds = new Set<string>(
          current
            .filter((n) => n.type === "chatCard" && !n.id.includes("/"))
            .map((n) => n.id)
        );
        for (const g of graph.nodes) {
          if (g.kind === "chat" && skipChat(g.id)) continue;
          finalIds.add(g.id);
        }

        setNodes((ns) => {
          const byId = new Map(ns.map((n) => [n.id, n]));
          const result: Node[] = ns
            .filter(
              (n) =>
                (n.type === "chatCard" && !n.id.includes("/")) ||
                (finalIds.has(n.id) && graph.nodes.some((g) => g.id === n.id))
            )
            .map((n) => {
              if (n.type === "chatCard") return n;
              const g = graph.nodes.find((g) => g.id === n.id)!;
              return {
                ...n,
                data: { ...n.data, degree: g.degree, kind: g.kind, label: g.label },
              };
            });
          for (const g of graph.nodes) {
            if (byId.has(g.id)) continue;
            if (g.kind === "chat" && skipChat(g.id)) continue;
            const stored = plugin.positions[g.id];
            const link = graph.edges.find(
              (e) =>
                (e.source === g.id && byId.has(e.target)) ||
                (e.target === g.id && byId.has(e.source))
            );
            const anchor = link
              ? byId.get(link.source === g.id ? link.target : link.source)
              : undefined;
            const base = anchor?.position ?? { x: 0, y: 0 };
            result.push(
              makeGraphNode(
                g,
                stored ?? {
                  x: base.x + 30 + (result.length % 4) * 40,
                  y: base.y + 150,
                }
              )
            );
          }
          return result;
        });
        setEdges((es) => {
          const extraEdges = es.filter(
            (e) => e.className === "gc-edge-chat" || e.className === "gc-edge-link"
          );
          const graphEdges: Edge[] = graph.edges
            .filter((e) => finalIds.has(e.source) && finalIds.has(e.target))
            .map((e) => ({
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
  }, [app, plugin, makeGraphNode]);

  const closeChat = useCallback((nodeId: string) => {
    if (nodeId.includes("/")) closedChatsRef.current.add(nodeId);
    setNodes((ns) => {
      const node = ns.find((n) => n.id === nodeId);
      const savedAs = (node?.data as any)?.filePath as string | undefined;
      if (savedAs) closedChatsRef.current.add(savedAs);
      return ns.filter((n) => n.id !== nodeId);
    });
    setEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, []);

  const sessionUpdate = useCallback((nodeId: string, sessionId: string) => {
    setNodes((ns) =>
      ns.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, currentSessionId: sessionId } } : n
      )
    );
  }, []);

  const cardSaved = useCallback((nodeId: string, filePath: string) => {
    // loadPath makes the card recoverable: overview swaps and viewport
    // culling unmount cards, and remounts rehydrate from this file
    setNodes((ns) =>
      ns.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, filePath, loadPath: filePath } }
          : n
      )
    );
  }, []);

  const tagsLoaded = useCallback((nodeId: string, tags: string[]) => {
    setNodes((ns) =>
      ns.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, linkedTags: tags } } : n
      )
    );
  }, []);

  /** Branch: FRESH chat window whose session continues from the branch point. */
  const forkChat = useCallback(
    (
      anchorNodeId: string,
      side: BranchSide,
      snapshot: ForkSnapshot,
      posOverride?: { x: number; y: number }
    ) => {
      if (!snapshot.sessionId) {
        new Notice("Nothing to branch from yet — send a message first.");
        return;
      }
      setNodes((ns) => {
        const anchor = ns.find((n) => n.id === anchorNodeId);
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
        const parentLevel =
          typeof (anchor.data as any).level === "number"
            ? ((anchor.data as any).level as number)
            : 1;
        const forkThread: ChatThread = {
          sourceNotePath: snapshot.sourceNotePath,
          sessionId: "",
          forkFromSessionId: snapshot.sessionId,
          messages: [], // fresh window — context lives in the resumed session
          level: parentLevel + 1,
        };
        const chatNode: Node = {
          id: chatId,
          type: "chatCard",
          position,
          dragHandle: ".gc-drag-handle",
          data: {
            sourceNotePath: snapshot.sourceNotePath,
            initialThread: forkThread,
            anchorNodeId,
            level: parentLevel + 1,
            metaLoaded: true,
            onClose: closeChat,
            onFork: (() => {}) as any, // bound below
            onSessionUpdate: (() => {}) as any,
            onSaved: (() => {}) as any,
            onTagsLoaded: (() => {}) as any,
          },
        };
        // note nodes expose plus-* handles, chat cards expose fork-*
        const sourceHandle =
          anchor.type === "chatCard" ? `fork-${side}` : `plus-${side}`;
        setEdges((es) => [
          ...es,
          {
            id: `${anchorNodeId}->${chatId}`,
            source: anchorNodeId,
            sourceHandle,
            target: chatId,
            targetHandle: side === "left" ? "from-right" : undefined,
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
            !forceNew &&
            (n.data as any).sourceNotePath === sourceNotePath &&
            (n.data as any).initialThread === undefined &&
            !(n.data as any).loadPath
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
            anchorNodeId,
            level: 1,
            metaLoaded: true,
            onClose: closeChat,
            onFork: (() => {}) as any, // bound below
            onSessionUpdate: (() => {}) as any,
            onSaved: (() => {}) as any,
            onTagsLoaded: (() => {}) as any,
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
      const prefixes = allChatFolders(plugin.settings).map((f) => f + "/");
      return app.vault
        .getMarkdownFiles()
        .filter((f) => prefixes.some((p) => f.path.startsWith(p)))
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
      if (!forceNew) {
        // plain click: if the note has chats, LIGHT THEM UP instead of opening
        const chatNotes = chatNotesLinkedTo(notePath);
        const openCards = nodesRef.current.filter(
          (n) =>
            n.type === "chatCard" &&
            ((n.data as any).anchorNodeId === nodeId ||
              chatNotes.includes(n.id) ||
              chatNotes.includes((n.data as any).filePath))
        );
        if (chatNotes.length > 0 || openCards.length > 0) {
          const hNodes = new Set<string>([
            nodeId,
            ...openCards.map((n) => n.id),
          ]);
          const hEdges = new Set<string>([
            ...chatNotes.map((c) => pairKey(nodeId, c)),
            ...openCards.map((n) => `${nodeId}->${n.id}`),
          ]);
          setHighlight({ nodes: hNodes, edges: hEdges });
        }
        // no chats → a plain click does nothing; chats start from “+” only
        return;
      }
      spawnCard(nodeId, notePath, true, side);
    },
    [spawnCard, chatNotesLinkedTo]
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
        // ---- tag dropped on a chat: real tag on the chat note (Tags: line) ----
        if (other.type === "tag") {
          const tagBase = ((other.data as any).path as string)
            .replace(/\.md$/, "")
            .split("/")
            .pop()!;
          const cur = ((card.data as any).linkedTags as string[]) ?? [];
          if (cur.includes(tagBase)) return;
          setNodes((all) =>
            all.map((n) =>
              n.id === card.id
                ? { ...n, data: { ...n.data, linkedTags: [...cur, tagBase] } }
                : n
            )
          );
          // saved (path-id) chats get the real edge from live sync; ephemeral
          // cards need a visual edge until then
          if (!card.id.includes("/")) {
            setEdges((es) => [
              ...es,
              {
                id: `taglink-${tagBase}->${card.id}`,
                source: other.id,
                target: card.id,
                targetHandle: "drop",
                className: "gc-edge-link",
                data: { tagBase, cardId: card.id },
              },
            ]);
          }
          new Notice(`Tagged chat with [[${tagBase}]]`);
          return;
        }

        // ---- chat→chat: target gains the other chat's transcript as context ----
        let notePath: string;
        if (other.type === "chatCard") {
          const la = (src.data as any).level as number | null | undefined;
          const lb = (tgt.data as any).level as number | null | undefined;
          if (typeof la === "number" && typeof lb === "number" && la === lb) {
            new Notice(
              "Same-level chats can't be linked — link across levels instead."
            );
            return;
          }
          // linking an orphan under a leveled chat adopts it one level below
          if (typeof la === "number" && typeof lb !== "number") {
            setNodes((all) =>
              all.map((n) =>
                n.id === tgt.id
                  ? { ...n, data: { ...n.data, level: la + 1 } }
                  : n
              )
            );
          } else if (typeof lb === "number" && typeof la !== "number") {
            setNodes((all) =>
              all.map((n) =>
                n.id === src.id
                  ? { ...n, data: { ...n.data, level: lb + 1 } }
                  : n
              )
            );
          }
          const p =
            ((other.data as any).filePath as string | undefined) ??
            (other.id.includes("/") ? other.id : undefined);
          if (!p) {
            new Notice("That chat has no saved note yet — send a message first.");
            return;
          }
          notePath = p;
        } else {
          notePath = (other.data as any).path as string;
        }
        const already = ((card.data as any).linkedNotes as string[]) ?? [];
        if (already.includes(notePath)) return;
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
            data: { notePath, cardId: card.id },
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

  // Drop a “+” drag on EMPTY canvas → open a chat/branch card right there.
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid) return;
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
          { sourceNotePath: data.sourceNotePath, sessionId },
          cardPos
        );
        return;
      }
      if ((data.kind as VaultNodeKind) === "tag") return;
      spawnCard(fromNode.id, data.path, true, side, cardPos);
    },
    [spawnCard, forkChat, screenToFlowPosition]
  );

  // Deleting an edge: chats can never stand alone — cutting a chat's edge
  // means deleting the chat (with confirmation). Note↔note edges remove the
  // [[wikilink]] from the note.
  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const e of deleted) {
        const ns = nodesRef.current;
        const src = ns.find((n) => n.id === e.source);
        const tgt = ns.find((n) => n.id === e.target);

        const chatNode =
          tgt?.type === "chatCard"
            ? tgt
            : src?.type === "chatCard"
            ? src
            : undefined;

        // context/tag link edges: clean the card's data so chips disappear
        // and the same link can be made again later
        if (e.className === "gc-edge-link") {
          const data = (e.data ?? {}) as { notePath?: string; tagBase?: string; cardId?: string };
          const cardId = data.cardId ?? (chatNode?.id as string | undefined);
          if (!cardId) continue;
          setNodes((all) =>
            all.map((n) => {
              if (n.id !== cardId) return n;
              const nd: any = { ...n.data };
              if (data.notePath) {
                nd.linkedNotes = ((nd.linkedNotes as string[]) ?? []).filter(
                  (p) => p !== data.notePath
                );
              }
              if (data.tagBase) {
                nd.linkedTags = ((nd.linkedTags as string[]) ?? []).filter(
                  (t) => t !== data.tagBase
                );
              }
              return { ...n, data: nd };
            })
          );
          continue;
        }

        // real tag↔chat edge: untag the chat note, never delete the chat
        if (chatNode && (src?.type === "tag" || tgt?.type === "tag")) {
          const tagNode = src?.type === "tag" ? src : tgt!;
          const tagBase = ((tagNode.data as any).path as string)
            .replace(/\.md$/, "")
            .split("/")
            .pop()!;
          setNodes((all) =>
            all.map((n) =>
              n.id === chatNode.id
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      linkedTags: (
                        ((n.data as any).linkedTags as string[]) ?? []
                      ).filter((t) => t !== tagBase),
                    },
                  }
                : n
            )
          );
          new Notice(`Removed [[${tagBase}]] from the chat`);
          continue;
        }

        if (chatNode) {
          // chats are real notes — detaching just removes the link, the chat
          // lives on standalone with whatever context it already holds
          const other = chatNode.id === e.source ? tgt : src;
          if (e.className === "gc-edge" && other?.type === "note") {
            setNodes((all) =>
              all.map((n) =>
                n.id === chatNode.id
                  ? { ...n, data: { ...n.data, sourceDetached: true, level: null } }
                  : n
              )
            );
            new Notice("Chat detached — it now stands alone.");
          }
          // cutting a branch edge orphans the child chat — level cleared
          if (e.className === "gc-edge-chat" && tgt?.type === "chatCard") {
            setNodes((all) =>
              all.map((n) =>
                n.id === tgt.id
                  ? { ...n, data: { ...n.data, level: null } }
                  : n
              )
            );
          }
          // never-used ephemeral card cut loose → nothing to keep, remove it
          if (
            e.className === "gc-edge-chat" &&
            !chatNode.id.includes("/") &&
            !(chatNode.data as any).filePath
          ) {
            setNodes((all) => all.filter((n) => n.id !== chatNode.id));
          }
          continue;
        }

        if (e.className === "gc-edge") {
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
              onSaved: cardSaved,
              onTagsLoaded: tagsLoaded,
            },
          };
        }
        return { ...n, className };
      }),
    [
      nodes,
      startChat,
      closeChat,
      forkChat,
      sessionUpdate,
      cardSaved,
      tagsLoaded,
      highlight,
      activeAnchors,
    ]
  );

  // edges touching a selected node flow (dashed + animated) toward its children
  const selectedIds = useMemo(
    () => new Set(nodes.filter((n) => n.selected).map((n) => n.id)),
    [nodes]
  );

  const displayEdges = useMemo(
    () =>
      edges.map((e) => {
        const glow = highlight?.edges.has(e.id) ?? false;
        const flow = selectedIds.has(e.source) || selectedIds.has(e.target);
        // narrow hit zone: edges stay clickable but stop eating pan gestures
        if (!glow && !flow) return { ...e, interactionWidth: 6 };
        return {
          ...e,
          interactionWidth: 6,
          animated: true,
          className: [e.className, glow && "gc-edge-glow", flow && "gc-edge-flow"]
            .filter(Boolean)
            .join(" "),
        };
      }),
    [edges, highlight, selectedIds]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (zoomedOut) {
        setFolderNodes((ns) => applyNodeChanges(changes, ns));
      } else {
        setNodes((ns) => applyNodeChanges(changes, ns));
      }
    },
    [zoomedOut]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es)),
    []
  );

  // ---- semantic zoom: folder overview ----
  const folderOf = useCallback(
    (n: Node): string => {
      if (n.type === "chatCard") {
        // chats belong to the folder of the note they came from
        const srcp = (n.data as any).sourceNotePath as string | undefined;
        if (srcp && srcp.includes("/")) return srcp.split("/")[0];
        return plugin.settings.chatsFolder.split("/")[0];
      }
      return n.id.split("/")[0];
    },
    [plugin]
  );

  const openFolder = useCallback(
    (folderId: string) => {
      const name = folderId.replace(/^folder:/, "");
      const members = nodesRef.current.filter((n) => folderOf(n) === name);
      if (members.length === 0) return;
      const cx =
        members.reduce((s, n) => s + n.position.x, 0) / members.length;
      const cy =
        members.reduce((s, n) => s + n.position.y, 0) / members.length;
      void setCenter(cx, cy, { zoom: 0.75, duration: 500 });
    },
    [folderOf, setCenter]
  );

  // overview lives in its own state so folder cards are draggable —
  // dragging one moves its whole cluster on drop
  const [folderNodes, setFolderNodes] = useState<Node[]>([]);
  const [folderEdges, setFolderEdges] = useState<Edge[]>([]);
  const edgesRef = useRef(edges);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    if (!zoomedOut) return;
    const ns = nodesRef.current;
    const groups = new Map<string, Node[]>();
    for (const n of ns) {
      const f = folderOf(n);
      if (!groups.has(f)) groups.set(f, []);
      groups.get(f)!.push(n);
    }
    const fNodes: Node[] = [...groups.entries()].map(([name, members]) => {
      const cx =
        members.reduce((s, n) => s + n.position.x, 0) / members.length;
      const cy =
        members.reduce((s, n) => s + n.position.y, 0) / members.length;
      const countLabel =
        name === plugin.settings.tagsFolder
          ? "tags"
          : name === plugin.settings.chatsFolder.split("/")[0]
          ? "chats"
          : "notes";
      return {
        id: `folder:${name}`,
        type: "folder",
        position: { x: cx, y: cy },
        deletable: false,
        data: {
          name,
          count: members.length,
          countLabel,
          centroid: { x: cx, y: cy },
          onOpen: openFolder,
        },
      };
    });
    const folderOfId = (id: string) => {
      const n = ns.find((x) => x.id === id);
      return n ? folderOf(n) : null;
    };
    const pairCounts = new Map<string, number>();
    for (const e of edgesRef.current) {
      const a = folderOfId(e.source);
      const b = folderOfId(e.target);
      if (!a || !b || a === b) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }
    setFolderEdges(
      [...pairCounts.entries()].map(([key, count]) => {
        const [a, b] = key.split("|");
        return {
          id: `folderedge:${key}`,
          source: `folder:${a}`,
          target: `folder:${b}`,
          className: "gc-edge-folder",
          style: { strokeWidth: Math.min(8, 1 + count / 4) },
          label: String(count),
        };
      })
    );
    setFolderNodes(fNodes);
  }, [zoomedOut, folderOf, openFolder, plugin]);

  // chat notes on disk: load Source/Level/Tags into node data even when the
  // card itself is culled off-screen (grouping and link rules depend on it)
  useEffect(() => {
    const pending = nodes.filter(
      (n) =>
        n.type === "chatCard" &&
        (n.data as any).loadPath &&
        !(n.data as any).metaLoaded
    );
    if (pending.length === 0) return;
    for (const n of pending) {
      const lp = (n.data as any).loadPath as string;
      const f = app.vault.getAbstractFileByPath(lp);
      if (!(f instanceof TFile)) continue;
      void app.vault.cachedRead(f).then((content) => {
        const t = parseThread(lp, content);
        setNodes((all) =>
          all.map((x) =>
            x.id === n.id
              ? {
                  ...x,
                  data: {
                    ...x.data,
                    metaLoaded: true,
                    sourceNotePath: t?.sourceNotePath ?? "",
                    level: t?.level ?? null,
                    linkedTags: t?.tags ?? [],
                    currentSessionId:
                      t?.sessionId || (x.data as any).currentSessionId,
                  },
                }
              : x
          )
        );
      });
    }
  }, [nodes, app]);

  // dragging a folder card moves every node in that folder by the same delta
  const onNodeDragStop = useCallback(
    (_e: unknown, node: Node) => {
      if (node.type === "folder") {
        const name = (node.data as any).name as string;
        const centroid = (node.data as any).centroid as { x: number; y: number };
        const dx = node.position.x - centroid.x;
        const dy = node.position.y - centroid.y;
        if (dx !== 0 || dy !== 0) {
          setNodes((ns) =>
            ns.map((n) =>
              folderOf(n) === name
                ? {
                    ...n,
                    position: {
                      x: n.position.x + dx,
                      y: n.position.y + dy,
                    },
                  }
                : n
            )
          );
          setFolderNodes((fs) =>
            fs.map((f) =>
              f.id === node.id
                ? { ...f, data: { ...f.data, centroid: { ...node.position } } }
                : f
            )
          );
        }
      }
      persistPositions();
    },
    [folderOf, persistPositions]
  );

  return (
    <PluginContext.Provider value={ctx}>
      <div className="gc-canvas-wrap">
        <ReactFlow
          nodes={zoomedOut ? folderNodes : boundNodes}
          edges={zoomedOut ? folderEdges : displayEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onEdgesDelete={onEdgesDelete}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={() => setHighlight(null)}
          connectOnClick={false}
          deleteKeyCode={["Backspace", "Delete"]}
          onlyRenderVisibleElements
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
