import { spawn } from "child_process";

// Shapes read off `claude -p --output-format stream-json` — narrow to the
// fields this file actually touches, not the CLI's full event schema.
interface StreamContentBlock {
  type: string;
  text?: string;
}

interface StreamSystemEvent {
  type: "system";
  subtype?: string;
  session_id?: string;
}

interface StreamAssistantEvent {
  type: "assistant";
  message?: { content?: StreamContentBlock[] };
}

interface StreamResultEvent {
  type: "result";
  session_id?: string;
  is_error?: boolean;
  result?: string;
}

type StreamEvent = StreamSystemEvent | StreamAssistantEvent | StreamResultEvent;

export interface RunPromptOptions {
  claudePath: string;
  vaultPath: string; // cwd for the CLI — vault root, so CLAUDE.md/skills apply
  prompt: string;
  model?: string; // CLI model alias/id; omit for the user's default
  resumeSessionId?: string;
  /** with resumeSessionId: fork into a NEW session instead of continuing */
  forkSession?: boolean;
  onText: (text: string) => void; // called per assistant message chunk
  onDone: (sessionId: string, fullText: string) => void;
  onError: (err: string) => void;
}

/**
 * One user turn = one headless `claude -p` invocation.
 * Read-only toolset — the AI can read the vault but never modify it.
 * Session continuity via --resume <session-id>.
 */
export function runPrompt(opts: RunPromptOptions): () => void {
  const args = [
    "-p",
    opts.prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--allowedTools",
    "Read",
    "Glob",
    "Grep",
    "--disallowedTools",
    "Write",
    "Edit",
    "Bash",
    "NotebookEdit",
    "WebFetch",
    "WebSearch",
  ];
  if (opts.model) {
    args.push("--model", opts.model);
  }
  if (opts.resumeSessionId) {
    args.push("--resume", opts.resumeSessionId);
    if (opts.forkSession) args.push("--fork-session");
  }

  const child = spawn(opts.claudePath, args, {
    cwd: opts.vaultPath,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let sessionId = opts.resumeSessionId ?? "";
  let fullText = "";
  let stderrBuf = "";
  let lineBuf = "";
  let finished = false;

  const handleEvent = (evt: StreamEvent) => {
    if (evt.type === "system" && evt.subtype === "init" && evt.session_id) {
      sessionId = evt.session_id;
    } else if (evt.type === "assistant") {
      const content = evt.message?.content;
      if (!content) return;
      for (const block of content) {
        if (block.type === "text" && block.text) {
          fullText += block.text;
          opts.onText(block.text);
        }
      }
    } else if (evt.type === "result") {
      finished = true;
      if (evt.session_id) sessionId = evt.session_id;
      if (evt.is_error) {
        opts.onError(String(evt.result ?? "Claude returned an error"));
      } else {
        // result carries the final text; prefer accumulated assistant text
        opts.onDone(sessionId, fullText || String(evt.result ?? ""));
      }
    }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    lineBuf += chunk.toString("utf8");
    let idx;
    while ((idx = lineBuf.indexOf("\n")) >= 0) {
      const line = lineBuf.slice(0, idx).trim();
      lineBuf = lineBuf.slice(idx + 1);
      if (!line) continue;
      try {
        handleEvent(JSON.parse(line) as StreamEvent);
      } catch {
        // non-JSON noise on stdout — ignore
      }
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString("utf8");
  });

  child.on("error", (err) => {
    opts.onError(
      `Could not start Claude CLI at "${opts.claudePath}": ${err.message}`
    );
  });

  child.on("close", (code) => {
    if (!finished && code !== 0) {
      opts.onError(
        `Claude exited with code ${code}${stderrBuf ? ": " + stderrBuf.slice(0, 500) : ""}`
      );
    }
  });

  return () => child.kill("SIGTERM");
}

/**
 * One-shot cheap Haiku call that names a chat from its first exchange.
 * Resolves null on any failure — callers keep the fallback name.
 */
export function generateTitle(
  claudePath: string,
  vaultPath: string,
  question: string,
  answer: string
): Promise<string | null> {
  return new Promise((resolve) => {
    const prompt = `Generate a short title (3-5 words, max 40 characters) for a conversation that starts with this question: "${question.slice(
      0,
      300
    )}" and this answer: "${answer.slice(
      0,
      500
    )}". Reply with ONLY the title text — no quotes, no trailing punctuation, no explanation.`;
    const child = spawn(
      claudePath,
      ["-p", prompt, "--model", "haiku", "--output-format", "json"],
      {
        cwd: vaultPath,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "ignore"],
      }
    );
    let out = "";
    child.stdout.on("data", (c: Buffer) => (out += c.toString("utf8")));
    child.on("close", () => {
      try {
        const j = JSON.parse(out) as { result?: string };
        const t = String(j.result ?? "")
          .trim()
          .split("\n")[0]
          .replace(/^["'#\s]+|["'.\s]+$/g, "");
        resolve(t && t.length > 0 && t.length <= 60 ? t : null);
      } catch {
        resolve(null);
      }
    });
    child.on("error", () => resolve(null));
  });
}
