import { useRef } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { usePluginCtx } from "./PluginContext";
import type { VaultNodeKind } from "../graph/buildGraph";

export interface NoteNodeData {
  label: string;
  path: string;
  degree: number;
  kind: VaultNodeKind;
  onStartChat: (
    notePath: string,
    nodeId: string,
    kind: VaultNodeKind,
    forceNew?: boolean
  ) => void;
  [key: string]: unknown;
}

/**
 * Rounded card with the note title inside.
 * Single click → open chat (if none open yet). Double click → open the note.
 * Hover “+” → branch another chat off the same note (new session, same anchor).
 */
export function NoteNode({ id, data }: NodeProps) {
  const d = data as NoteNodeData;
  const { app } = usePluginCtx();
  const clickTimer = useRef<number | null>(null);

  const openNote = () => {
    const file = app.vault.getAbstractFileByPath(d.path);
    if (file) app.workspace.getLeaf("tab").openFile(file as any);
  };

  return (
    <div className="gc-note-node">
      <Handle type="source" position={Position.Right} className="gc-handle" />
      <Handle type="target" position={Position.Left} className="gc-handle" />
      <div
        className={`gc-note-card${d.kind === "chat" ? " gc-kind-chat" : ""}${
          d.degree >= 8 ? " gc-hub" : ""
        }`}
        onClick={() => {
          if (clickTimer.current !== null) return;
          clickTimer.current = window.setTimeout(() => {
            clickTimer.current = null;
            d.onStartChat(d.path, id, d.kind);
          }, 250);
        }}
        onDoubleClick={() => {
          if (clickTimer.current !== null) {
            window.clearTimeout(clickTimer.current);
            clickTimer.current = null;
          }
          openNote();
        }}
        title={`${d.path}\nclick: chat · double-click: open note`}
      >
        <span className="gc-note-title">{d.label}</span>
        {d.kind !== "chat" && (
          <button
            className="gc-plus-btn"
            title="Branch a new chat off this note"
            onClick={(e) => {
              e.stopPropagation();
              if (clickTimer.current !== null) {
                window.clearTimeout(clickTimer.current);
                clickTimer.current = null;
              }
              d.onStartChat(d.path, id, d.kind, true);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}
