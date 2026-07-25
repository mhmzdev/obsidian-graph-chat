import { App, TFile, normalizePath } from "obsidian";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface ChatThread {
  sourceNotePath: string; // note the chat branched from
  sessionId: string;
  messages: ChatMessage[];
  filePath?: string; // set once persisted
  /** fork parent — first send resumes this session with --fork-session */
  forkFromSessionId?: string;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Persist a chat thread as a real markdown note in the chats folder.
 * Plain-text header (no YAML), wikilink back to the source note — so the
 * thread appears in the native graph attached to the note it came from.
 */
export async function saveThread(
  app: App,
  chatsFolder: string,
  thread: ChatThread
): Promise<string> {
  const sourceBase = thread.sourceNotePath.replace(/\.md$/, "").split("/").pop() ?? "";
  const firstUser = thread.messages.find((m) => m.role === "user")?.text ?? "chat";

  if (!thread.filePath) {
    const base = `chat - ${slug(sourceBase)} - ${slug(firstUser) || "thread"}`;
    let candidate = normalizePath(`${chatsFolder}/${base}.md`);
    for (let i = 2; app.vault.getAbstractFileByPath(candidate); i++) {
      candidate = normalizePath(`${chatsFolder}/${base} ${i}.md`);
    }
    thread.filePath = candidate;
  }

  const lines: string[] = [
    `Source: [[${sourceBase}]]`,
    `Session: ${thread.sessionId || "pending"}`,
    `Updated: ${today()}`,
    "",
    `# Chat — ${sourceBase}`,
    "",
  ];
  for (const m of thread.messages) {
    lines.push(m.role === "user" ? "## Me" : "## Claude");
    lines.push("");
    lines.push(m.text.trim());
    lines.push("");
  }
  const content = lines.join("\n");

  const folder = normalizePath(chatsFolder);
  if (!app.vault.getAbstractFileByPath(folder)) {
    await app.vault.createFolder(folder);
  }

  const existing = app.vault.getAbstractFileByPath(thread.filePath);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, content);
  } else {
    await app.vault.create(thread.filePath, content);
  }
  return thread.filePath;
}

/**
 * Parse a saved chat note back into a thread so it can be reopened
 * (and its Claude session resumed via the stored session id).
 */
export function parseThread(
  filePath: string,
  content: string
): ChatThread | null {
  const sourceMatch = content.match(/^Source: \[\[(.+?)\]\]/m);
  const sessionMatch = content.match(/^Session: (\S+)/m);

  const messages: ChatMessage[] = [];
  const parts = content.split(/^## (Me|Claude)\s*$/m);
  for (let i = 1; i + 1 < parts.length + 1; i += 2) {
    const body = parts[i + 1];
    if (body === undefined) break;
    messages.push({
      role: parts[i] === "Me" ? "user" : "assistant",
      text: body.trim(),
    });
  }

  if (!sourceMatch && messages.length === 0) return null;
  const sessionId = sessionMatch?.[1];
  return {
    sourceNotePath: (sourceMatch?.[1] ?? "unknown") + ".md",
    sessionId: sessionId && sessionId !== "pending" ? sessionId : "",
    messages,
    filePath,
  };
}
