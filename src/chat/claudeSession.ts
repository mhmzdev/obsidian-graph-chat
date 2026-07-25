import { spawn } from "child_process";

export interface RunPromptOptions {
  claudePath: string;
  vaultPath: string; // cwd for the CLI — vault root, so CLAUDE.md/skills apply
  prompt: string;
  model?: string; // CLI model alias/id; omit for the user's default
  resumeSessionId?: string;
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

  const handleEvent = (evt: any) => {
    if (evt.type === "system" && evt.subtype === "init" && evt.session_id) {
      sessionId = evt.session_id;
    } else if (evt.type === "assistant" && evt.message?.content) {
      for (const block of evt.message.content) {
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
        handleEvent(JSON.parse(line));
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
