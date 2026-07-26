import { useRef, useState, useEffect } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import {
  FileSystemAdapter,
  MarkdownRenderer,
  Component,
  setIcon,
  TFile,
} from "obsidian";
import { usePluginCtx } from "./PluginContext";
import { runPrompt, generateTitle } from "../chat/claudeSession";
import {
  saveThread,
  parseThread,
  renameThreadFile,
  ChatThread,
  ChatMessage,
} from "../chat/persistence";
import type { BranchSide } from "./NoteNode";

export interface ForkSnapshot {
  sourceNotePath: string;
  sessionId: string;
}

export interface ChatCardData {
  sourceNotePath: string;
  /** present when spawning with a known thread (branch, ephemeral) */
  initialThread?: ChatThread;
  /** saved chat note path — the card loads its thread from this file */
  loadPath?: string;
  anchorNodeId?: string;
  /** vault paths dropped onto this card as extra context */
  linkedNotes?: string[];
  /** kept fresh by the card so drag-branches know the live session */
  currentSessionId?: string;
  /** kept fresh by the card once the thread is saved to disk */
  filePath?: string;
  onClose: (nodeId: string) => void;
  onFork: (nodeId: string, side: BranchSide, snapshot: ForkSnapshot) => void;
  onSessionUpdate: (nodeId: string, sessionId: string) => void;
  onSaved: (nodeId: string, filePath: string) => void;
  [key: string]: unknown;
}

const MODELS: { label: string; value: string }[] = [
  { label: "Sonnet", value: "sonnet" },
  { label: "Fable 5", value: "claude-fable-5" },
  { label: "Opus", value: "opus" },
  { label: "Haiku", value: "haiku" },
];

const INPUT_MAX_HEIGHT = 110; // ~5 lines

/** Lucide icon via Obsidian's built-in icon set. */
export function Icon({ name, size = 14 }: { name: string; size?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.empty();
    setIcon(el, name);
    const svg = el.querySelector("svg");
    if (svg) {
      svg.setAttribute("width", String(size));
      svg.setAttribute("height", String(size));
    }
  }, [name, size]);
  return <span ref={ref} className="gc-icon" />;
}

/** Assistant messages render as real Obsidian markdown, wikilinks clickable. */
function MarkdownMsg({ text }: { text: string }) {
  const { app } = usePluginCtx();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.empty();
    const comp = new Component();
    comp.load();
    void MarkdownRenderer.render(app, text, el, "", comp).then(() => {
      el.querySelectorAll("a.internal-link").forEach((a) => {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          const target = a.getAttribute("data-href") ?? a.getAttribute("href");
          if (target) app.workspace.openLinkText(target, "", true);
        });
      });
    });
    return () => comp.unload();
  }, [app, text]);

  return <div ref={ref} className="gc-md" />;
}

export function ChatCardNode({ id, data }: NodeProps) {
  const d = data as ChatCardData;
  const { app, plugin } = usePluginCtx();
  const threadRef = useRef<ChatThread>(
    d.initialThread ?? {
      sourceNotePath: d.sourceNotePath,
      sessionId: "",
      messages: [],
    }
  );
  const isBranchRef = useRef(!!threadRef.current.forkFromSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>(
    threadRef.current.messages
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState("sonnet");
  const [menuOpen, setMenuOpen] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(
    threadRef.current.filePath ?? d.loadPath ?? null
  );
  const [title, setTitle] = useState<string | null>(
    threadRef.current.title ?? null
  );
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const cancelRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const consumedLinksRef = useRef(0);

  const linkedNotes = (d.linkedNotes ?? []) as string[];

  // Saved chat notes render directly as chat boxes: load thread from disk.
  useEffect(() => {
    if (!d.loadPath || threadRef.current.messages.length > 0) return;
    const f = app.vault.getAbstractFileByPath(d.loadPath);
    if (!(f instanceof TFile)) return;
    void app.vault.cachedRead(f).then((content) => {
      const t = parseThread(d.loadPath!, content);
      if (!t) return;
      threadRef.current = t;
      setMessages(t.messages);
      setSavedPath(t.filePath ?? d.loadPath!);
      setTitle(t.title ?? null);
      // drag-branches read the session from node data — keep it fresh
      if (t.sessionId) d.onSessionUpdate(id, t.sessionId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sourceName =
    threadRef.current.sourceNotePath.replace(/\.md$/, "").split("/").pop() ??
    "note";
  const displayTitle = title ?? sourceName;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => () => cancelRef.current?.(), []);

  const autoGrow = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, INPUT_MAX_HEIGHT) + "px";
  };

  const persist = async () => {
    try {
      const path = await saveThread(
        app,
        plugin.settings.chatsFolder,
        threadRef.current
      );
      setSavedPath(path);
      d.onSaved(id, path);
    } catch (e: any) {
      setError("Saving chat failed: " + e.message);
    }
  };

  const applyTitle = async (t: string) => {
    setTitle(t);
    threadRef.current.title = t;
    if (!threadRef.current.filePath && threadRef.current.messages.length === 0)
      return;
    const renamed = await renameThreadFile(
      app,
      plugin.settings.chatsFolder,
      threadRef.current,
      t
    );
    await persist();
    if (renamed) {
      setSavedPath(renamed);
      d.onSaved(id, renamed);
    }
  };

  const commitTitle = () => {
    setEditingTitle(false);
    const t = titleDraft.trim();
    if (!t || t === displayTitle) return;
    void applyTitle(t);
  };

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setError(null);
    setBusy(true);

    const thread = threadRef.current;
    const isFirstEver = thread.messages.length === 0;
    thread.messages.push({ role: "user", text });
    setMessages([...thread.messages]);
    void persist();

    let prefix = "";
    if (isFirstEver && !thread.forkFromSessionId) {
      prefix += `You are chatting inside an Obsidian vault. This conversation is anchored to the note "${thread.sourceNotePath}". Read that note first, follow its wikilinks if helpful, then answer concisely.\n\n`;
    }
    const freshLinks = linkedNotes.slice(consumedLinksRef.current);
    if (freshLinks.length > 0) {
      prefix += `Also read these vault notes as additional context before answering: ${freshLinks
        .map((p) => `"${p}"`)
        .join(", ")}.\n\n`;
      consumedLinksRef.current = linkedNotes.length;
    }
    const prompt = prefix ? prefix + "Question: " + text : text;

    const adapter = app.vault.adapter;
    const vaultPath =
      adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";

    thread.messages.push({ role: "assistant", text: "" });
    setMessages([...thread.messages]);
    const assistantMsg = thread.messages[thread.messages.length - 1];

    cancelRef.current = runPrompt({
      claudePath: plugin.settings.claudePath,
      vaultPath,
      prompt,
      model: model || undefined,
      resumeSessionId: thread.sessionId || thread.forkFromSessionId || undefined,
      forkSession: !thread.sessionId && !!thread.forkFromSessionId,
      onText: (chunk) => {
        assistantMsg.text += chunk;
        setMessages([...thread.messages]);
      },
      onDone: async (sessionId, fullText) => {
        assistantMsg.text = fullText || assistantMsg.text;
        thread.sessionId = sessionId; // a branch gets its own id here
        d.onSessionUpdate(id, sessionId);
        setMessages([...thread.messages]);
        setBusy(false);
        await persist();
        // first exchange of an untitled chat → cheap Haiku call names it
        if (isFirstEver && !thread.title) {
          void generateTitle(
            plugin.settings.claudePath,
            vaultPath,
            text,
            assistantMsg.text
          ).then((t) => {
            if (!t || threadRef.current.title) return;
            void applyTitle(t);
          });
        }
      },
      onError: (err) => {
        setError(err);
        setBusy(false);
        void persist();
      },
    });
  };

  const openChatNote = () => {
    if (!savedPath) return;
    const file = app.vault.getAbstractFileByPath(savedPath);
    if (file) app.workspace.getLeaf("tab").openFile(file as any);
  };

  const forkHandle = (side: BranchSide) => (
    <Handle
      type="source"
      id={`fork-${side}`}
      position={side === "left" ? Position.Left : Position.Right}
      className={`gc-plus-handle gc-plus-${side} gc-fork-handle`}
      title="Click: branch from here · Drag: link a note in, or drop on empty space to branch there"
      onClick={(e) => {
        e.stopPropagation();
        d.onFork(id, side, {
          sourceNotePath: threadRef.current.sourceNotePath,
          sessionId: threadRef.current.sessionId,
        });
      }}
    >
      <span className="gc-plus-glyph">+</span>
    </Handle>
  );

  const currentModel = MODELS.find((m) => m.value === model) ?? MODELS[0];

  return (
    <div className="gc-chat-card nowheel">
      <Handle type="target" position={Position.Left} className="gc-handle" />
      <Handle
        type="target"
        id="from-right"
        position={Position.Right}
        className="gc-handle"
      />
      <Handle
        type="target"
        id="drop"
        position={Position.Left}
        className="gc-drop-target"
        isConnectableStart={false}
      />
      {forkHandle("left")}
      {forkHandle("right")}
      <div className="gc-chat-header gc-drag-handle">
        <span className="gc-chat-title">
          <Icon name="message-circle" size={14} />
          {editingTitle ? (
            <input
              className="gc-title-input nodrag"
              value={titleDraft}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              onBlur={commitTitle}
            />
          ) : (
            <span
              className="gc-chat-title-text"
              title="Click to rename"
              onClick={() => {
                setTitleDraft(displayTitle);
                setEditingTitle(true);
              }}
            >
              {displayTitle}
            </span>
          )}
          <span className="gc-fork-badge">
            {isBranchRef.current ? "branch" : "chat"}
          </span>
        </span>
        <span className="gc-header-btns">
          <button
            className="gc-header-btn"
            title={savedPath ? "Open chat note" : "Chat note appears after first message"}
            disabled={!savedPath}
            onClick={openChatNote}
          >
            <Icon name="file-text" size={13} />
          </button>
          <button
            className="gc-header-btn"
            title="Hide card (chat stays saved)"
            onClick={() => d.onClose(id)}
          >
            <Icon name="x" size={13} />
          </button>
        </span>
      </div>
      <div className="gc-chat-messages" ref={scrollRef}>
        {messages.length === 0 &&
          (isBranchRef.current ? (
            <div className="gc-chat-empty">
              <b>Branched conversation</b> — Claude remembers everything up to
              the branch point of <b>{sourceName}</b>. Continue from here,
              with any model.
            </div>
          ) : (
            <div className="gc-chat-empty">
              Ask anything about <b>{sourceName}</b> — Claude reads your vault
              (read-only). The thread saves automatically to{" "}
              <b>{plugin.settings.chatsFolder}/</b>.
            </div>
          ))}
        {messages.map((m, i) => (
          <div key={i} className={`gc-msg gc-msg-${m.role}`}>
            {m.role === "assistant" ? (
              m.text ? (
                <MarkdownMsg text={m.text} />
              ) : busy && i === messages.length - 1 ? (
                <span className="gc-typing">Thinking…</span>
              ) : (
                ""
              )
            ) : (
              m.text
            )}
          </div>
        ))}
        {error && <div className="gc-msg gc-msg-error">{error}</div>}
      </div>
      {linkedNotes.length > 0 && (
        <div className="gc-chips">
          {linkedNotes.map((p) => (
            <span key={p} className="gc-chip" title={p}>
              <Icon name="paperclip" size={9} />
              {p.replace(/\.md$/, "").split("/").pop()}
            </span>
          ))}
        </div>
      )}
      <div className="gc-chat-input-row">
        <textarea
          ref={inputRef}
          className="gc-chat-input"
          value={input}
          rows={1}
          placeholder={busy ? "Claude is thinking…" : "Ask about this note…"}
          disabled={busy}
          onChange={(e) => {
            setInput(e.target.value);
            autoGrow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          className="gc-send-btn"
          onClick={send}
          disabled={busy || !input.trim()}
          title={busy ? "Claude is thinking…" : "Send"}
        >
          {busy ? <span className="gc-spinner" /> : <Icon name="send" size={14} />}
        </button>
      </div>
      <div className="gc-chat-footer">
        <div className="gc-model-wrap" onMouseLeave={() => setMenuOpen(false)}>
          {menuOpen && (
            <div className="gc-model-menu">
              {MODELS.map((m) => (
                <div
                  key={m.value}
                  className={`gc-model-item${
                    m.value === model ? " gc-model-active" : ""
                  }`}
                  onClick={() => {
                    setModel(m.value);
                    setMenuOpen(false);
                  }}
                >
                  <span>{m.label}</span>
                  {m.value === model && <Icon name="check" size={11} />}
                </div>
              ))}
            </div>
          )}
          <button
            className="gc-model-btn"
            disabled={busy}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {currentModel.label}
            <Icon name="chevron-down" size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}
