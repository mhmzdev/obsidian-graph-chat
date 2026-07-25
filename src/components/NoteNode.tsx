import { Handle, Position, NodeProps } from "@xyflow/react";
import { usePluginCtx } from "./PluginContext";

export interface NoteNodeData {
  label: string;
  path: string;
  degree: number;
  onStartChat: (notePath: string, nodeId: string) => void;
  [key: string]: unknown;
}

export function NoteNode({ id, data }: NodeProps) {
  const d = data as NoteNodeData;
  const { app } = usePluginCtx();
  const size = Math.min(56, 22 + d.degree * 2.5);

  return (
    <div className="gc-note-node">
      <Handle type="source" position={Position.Right} className="gc-handle" />
      <Handle type="target" position={Position.Left} className="gc-handle" />
      <div
        className="gc-note-circle"
        style={{ width: size, height: size }}
        onDoubleClick={() => {
          const file = app.vault.getAbstractFileByPath(d.path);
          if (file) app.workspace.getLeaf("tab").openFile(file as any);
        }}
        title={d.path}
      />
      <div className="gc-note-actions">
        <button
          className="gc-chat-btn"
          title="Chat about this note"
          onClick={() => d.onStartChat(d.path, id)}
        >
          💬
        </button>
      </div>
      <div className="gc-note-label">{d.label}</div>
    </div>
  );
}
