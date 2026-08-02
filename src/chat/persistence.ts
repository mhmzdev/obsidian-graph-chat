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
  /** branch parent — first send resumes this session with --fork-session */
  forkFromSessionId?: string;
  /** user-set display title (stored as the # heading) */
  title?: string;
  /** tag basenames linked onto this chat (stored on the Tags: line) */
  tags?: string[];
  /** branch depth (1 = chat from a note). Undefined = orphan, attachable anywhere. */
  level?: number;
  /** additional notes sharing context with this chat (co-sources) */
  coSources?: string[];
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

  const lines: string[] = [];
  if (thread.tags && thread.tags.length > 0) {
    lines.push(`Tags: ${thread.tags.map((t) => `[[${t}]]`).join(" ")}`);
  }
  if (sourceBase) {
    const links = [
      `[[${sourceBase}]]`,
      ...(thread.coSources ?? []).map(
        (p) => `[[${p.replace(/\.md$/, "").split("/").pop()}]]`
      ),
    ];
    lines.push(`Source: ${[...new Set(links)].join(" ")}`);
  }
  lines.push(`Session: ${thread.sessionId || "pending"}`);
  if (typeof thread.level === "number") {
    lines.push(`Level: ${thread.level}`);
  }
  lines.push(
    `Updated: ${today()}`,
    "",
    `# ${thread.title ?? (sourceBase ? `Chat — ${sourceBase}` : "Chat")}`,
    ""
  );
  for (const m of thread.messages) {
    lines.push(m.role === "user" ? "## Me" : "## Claude");
    lines.push("");
    lines.push(m.text.trim());
    lines.push("");
  }
  const content = lines.join("\n");

  const folder = normalizePath(chatsFolder);
  if (!app.vault.getAbstractFileByPath(folder)) {
    // another card racing to save into a brand-new folder may win first
    await app.vault.createFolder(folder).catch(() => {});
  }

  // an already-persisted thread owns a stable path — just overwrite it.
  // (Threads without one yet MUST NOT fall into modify() below: another
  // card's fresh chat could coincidentally claim the same candidate name
  // first, and modifying "existing" there would silently clobber it.)
  if (thread.filePath) {
    const existing = app.vault.getAbstractFileByPath(thread.filePath);
    if (existing instanceof TFile) {
      await app.vault.modify(existing, content);
    } else {
      // known path, but the file's gone (e.g. deleted outside the plugin) —
      // recreate it there rather than hunting for a fresh name
      await app.vault.create(thread.filePath, content);
    }
    return thread.filePath;
  }

  const base = sourceBase
    ? `chat - ${slug(sourceBase)} - ${slug(firstUser) || "thread"}`
    : `chat - ${slug(firstUser) || "thread"}`;
  thread.filePath = await createUnclaimed(app, chatsFolder, base, content);
  return thread.filePath;
}

/**
 * Claim the first available "<base>[ N].md" name and create it there.
 * Two threads can both see a name as free and race to create() it —
 * losing that race isn't fatal, it just means someone else took the slot
 * first, so retry the next candidate instead of surfacing an error.
 */
async function createUnclaimed(
  app: App,
  chatsFolder: string,
  base: string,
  content: string
): Promise<string> {
  const MAX_ATTEMPTS = 50;
  let candidate = normalizePath(`${chatsFolder}/${base}.md`);
  for (let i = 2; i <= MAX_ATTEMPTS + 1; i++) {
    if (!app.vault.getAbstractFileByPath(candidate)) {
      try {
        await app.vault.create(candidate, content);
        return candidate;
      } catch {
        // lost the race for this name — fall through and try the next one
      }
    }
    candidate = normalizePath(`${chatsFolder}/${base} ${i}.md`);
  }
  throw new Error(`Could not find a free name for "${base}" after ${MAX_ATTEMPTS} attempts`);
}

/**
 * Source: lines store bare wikilinks ("[[Note]]"). Resolve to the note's real
 * vault path so folder grouping and chat routing know where it lives.
 */
export function resolveSourcePath(
  app: App,
  sourceNotePath: string,
  chatFilePath: string
): string {
  if (!sourceNotePath || sourceNotePath.includes("/")) return sourceNotePath;
  const dest = app.metadataCache.getFirstLinkpathDest(
    sourceNotePath.replace(/\.md$/, ""),
    chatFilePath
  );
  return dest?.path ?? sourceNotePath;
}

/**
 * Rename a saved chat note to match its title: `chat - <title slug>.md`.
 * Uses fileManager.renameFile so backlinks stay intact. Returns the new path.
 */
export async function renameThreadFile(
  app: App,
  thread: ChatThread,
  title: string
): Promise<string | null> {
  if (!thread.filePath) return null;
  const f = app.vault.getAbstractFileByPath(thread.filePath);
  if (!(f instanceof TFile)) return null;
  // stay in whatever folder the chat already lives in
  const folder = thread.filePath.split("/").slice(0, -1).join("/");
  const base = `chat - ${slug(title) || "thread"}`;
  let candidate = normalizePath(`${folder}/${base}.md`);
  if (candidate === thread.filePath) return thread.filePath;
  for (let i = 2; app.vault.getAbstractFileByPath(candidate); i++) {
    candidate = normalizePath(`${folder}/${base} ${i}.md`);
  }
  await app.fileManager.renameFile(f, candidate);
  thread.filePath = candidate;
  return candidate;
}

/**
 * Parse a saved chat note back into a thread so it can be reopened
 * (and its Claude session resumed via the stored session id).
 */
export function parseThread(
  filePath: string,
  content: string
): ChatThread | null {
  const sourceLine = content.match(/^Source: (.+)$/m)?.[1] ?? "";
  const sourceLinks = [...sourceLine.matchAll(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g)].map(
    (m) => m[1]
  );
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

  if (sourceLinks.length === 0 && messages.length === 0) return null;
  const sessionId = sessionMatch?.[1];
  const headingMatch = content.match(/^# (.+)$/m);
  const heading = headingMatch?.[1]?.trim();
  const tagsLine = content.match(/^Tags: (.+)$/m)?.[1] ?? "";
  const tags = [...tagsLine.matchAll(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g)].map(
    (m) => m[1]
  );
  const levelMatch = content.match(/^Level: (\d+)$/m);
  return {
    sourceNotePath: sourceLinks.length > 0 ? sourceLinks[0] + ".md" : "",
    sessionId: sessionId && sessionId !== "pending" ? sessionId : "",
    messages,
    filePath,
    title: heading && !heading.startsWith("Chat — ") ? heading : undefined,
    tags: tags.length > 0 ? tags : undefined,
    level: levelMatch ? parseInt(levelMatch[1], 10) : undefined,
    coSources:
      sourceLinks.length > 1
        ? sourceLinks.slice(1).map((b) => b + ".md")
        : undefined,
  };
}
