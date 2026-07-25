import { useRef, useState, useEffect } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { FileSystemAdapter } from "obsidian";
import { usePluginCtx } from "./PluginContext";
import { runPrompt } from "../chat/claudeSession";
import { saveThread, ChatThread, ChatMessage } from "../chat/persistence";

export interface ChatCardData {
  sourceNotePath: string;
  /** present when reopening a saved chat note — resumes its session */
  initialThread?: ChatThread;
  onClose: (nodeId: string) => void;
  [key: string]: unknown;
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
  const [savedPath, setSavedPath] = useState<string | null>(
    threadRef.current.filePath ?? null
  );
  const cancelRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sourceName =
    threadRef.current.sourceNotePath.replace(/\.md$/, "").split("/").pop() ??
    "note";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => () => cancelRef.current?.(), []);

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
    setError(null);
    setBusy(true);

    const thread = threadRef.current;
    const isFirst = thread.messages.length === 0;
    thread.messages.push({ role: "user", text });
    setMessages([...thread.messages]);
    void persist(); // save immediately — the thread exists in Chats/ from message one

    // First turn: point Claude at the source note. After that --resume keeps context.
    const prompt = isFirst
      ? `You are chatting inside an Obsidian vault. This conversation is anchored to the note "${thread.sourceNotePath}". Read that note first, follow its wikilinks if helpful, then answer concisely.\n\nQuestion: ${text}`
      : text;

    const adapter = app.vault.adapter;
    const vaultPath =
      adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";

    // streaming assistant message placeholder
    thread.messages.push({ role: "assistant", text: "" });
    setMessages([...thread.messages]);
    const assistantMsg = thread.messages[thread.messages.length - 1];

    cancelRef.current = runPrompt({
      claudePath: plugin.settings.claudePath,
      vaultPath,
      prompt,
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

  return (
    <div className="gc-chat-card nowheel nodrag">
      <Handle type="target" position={Position.Left} className="gc-handle" />
      <div className="gc-chat-header gc-drag-handle">
        <span className="gc-chat-title">💬 {sourceName}</span>
        <button className="gc-close-btn" onClick={() => d.onClose(id)}>
          ✕
        </button>
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
            {m.text || (busy && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
        {error && <div className="gc-msg gc-msg-error">{error}</div>}
      </div>
      <div className="gc-chat-input-row">
        <textarea
          className="gc-chat-input"
          value={input}
          placeholder={busy ? "Claude is thinking…" : "Ask about this note…"}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="gc-send-btn" onClick={send} disabled={busy}>
          ➤
        </button>
      </div>
      {savedPath && <div className="gc-saved-path">saved · {savedPath}</div>}
    </div>
  );
}
