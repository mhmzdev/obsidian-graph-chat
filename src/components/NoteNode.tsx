import { useRef } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { usePluginCtx } from "./PluginContext";
import type { VaultNodeKind } from "../graph/buildGraph";

export interface NoteNodeData {
  label: string;
  path: string;
  degree: number;
  kind: VaultNodeKind;
  onStartChat: (notePath: string, nodeId: string, kind: VaultNodeKind) => void;
  [key: string]: unknown;
}

/**
 * Single click → open chat card. Double click → open the note itself.
 * A short timer distinguishes the two so a double click never also
 * spawns a chat.
 */
export function NoteNode({ id, data }: NodeProps) {
  const d = data as NoteNodeData;
  const { app } = usePluginCtx();
  const size = Math.min(56, 22 + d.degree * 2.5);
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
        className={`gc-note-circle${d.kind === "chat" ? " gc-kind-chat" : ""}`}
        style={{ width: size, height: size }}
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
      />
      <div className="gc-note-label">{d.label}</div>
    </div>
  );
}
