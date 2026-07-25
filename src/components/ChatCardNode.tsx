import { useRef, useState, useEffect } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { FileSystemAdapter, MarkdownRenderer, Component } from "obsidian";
import { usePluginCtx } from "./PluginContext";
import { runPrompt } from "../chat/claudeSession";
import { saveThread, ChatThread, ChatMessage } from "../chat/persistence";

export interface ChatCardData {
  sourceNotePath: string;
  /** present when reopening a saved chat note — resumes its session */
  initialThread?: ChatThread;
  anchorNodeId?: string;
  onClose: (nodeId: string) => void;
  [key: string]: unknown;
}

const MODELS: { label: string; value: string }[] = [
  { label: "Default", value: "" },
  { label: "Fable 5", value: "claude-fable-5" },
  { label: "Opus", value: "opus" },
  { label: "Sonnet", value: "sonnet" },
  { label: "Haiku", value: "haiku" },
];

const INPUT_MAX_HEIGHT = 110; // ~5 lines

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
  const [messages, setMessages] = useState<ChatMessage[]>(
    threadRef.current.messages
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [savedPath, setSavedPath] = useState<string | null>(
    threadRef.current.filePath ?? null
  );
  const cancelRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const sourceName =
    threadRef.current.sourceNotePath.replace(/\.md$/, "").split("/").pop() ??
    "note";

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
    } catch (e: any) {
      setError("Saving chat failed: " + e.message);
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setError(null);
    setBusy(true);

    const thread = threadRef.current;
    const isFirst = thread.messages.length === 0;
    thread.messages.push({ role: "user", text });
    setMessages([...thread.messages]);
    void persist(); // the thread exists in Chats/ from message one

    // First turn: point Claude at the source note. After that --resume keeps context.
    const prompt = isFirst
      ? `You are chatting inside an Obsidian vault. This conversation is anchored to the note "${thread.sourceNotePath}". Read that note first, follow its wikilinks if helpful, then answer concisely.\n\nQuestion: ${text}`
      : text;

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
      resumeSessionId: thread.sessionId || undefined,
      onText: (chunk) => {
        assistantMsg.text += chunk;
        setMessages([...thread.messages]);
      },
      onDone: async (sessionId, fullText) => {
        assistantMsg.text = fullText || assistantMsg.text;
        thread.sessionId = sessionId;
        setMessages([...thread.messages]);
        setBusy(false);
        await persist();
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

  return (
    <div className="gc-chat-card nowheel">
      <Handle type="target" position={Position.Left} className="gc-handle" />
      <Handle
        type="target"
        id="from-right"
        position={Position.Right}
        className="gc-handle"
      />
      <div className="gc-chat-header gc-drag-handle">
        <span className="gc-chat-title">💬 {sourceName}</span>
        <span className="gc-header-btns">
          <button
            className="gc-header-btn"
            title={savedPath ? "Open chat note" : "Chat note appears after first message"}
            disabled={!savedPath}
            onClick={openChatNote}
          >
            📄
          </button>
          <button
            className="gc-header-btn"
            title="Close card (chat stays saved)"
            onClick={() => d.onClose(id)}
          >
            ✕
          </button>
        </span>
      </div>
      <div className="gc-chat-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="gc-chat-empty">
            Ask anything about <b>{sourceName}</b> — Claude reads your vault
            (read-only). The thread saves automatically to{" "}
            <b>{plugin.settings.chatsFolder}/</b>.
          </div>
        )}
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
          {busy ? <span className="gc-spinner" /> : "➤"}
        </button>
      </div>
      <div className="gc-chat-footer">
        <select
          className="gc-model-select"
          value={model}
          disabled={busy}
          onChange={(e) => setModel(e.target.value)}
          title="Model for this chat"
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
