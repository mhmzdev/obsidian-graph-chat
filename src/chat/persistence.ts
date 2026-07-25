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
    const name = `chat - ${slug(sourceBase)} - ${slug(firstUser) || "thread"}.md`;
    thread.filePath = normalizePath(`${chatsFolder}/${name}`);
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
