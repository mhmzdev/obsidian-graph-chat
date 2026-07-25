import { useRef } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { usePluginCtx } from "./PluginContext";
import type { VaultNodeKind } from "../graph/buildGraph";

export type BranchSide = "left" | "right";

export interface NoteNodeData {
  label: string;
  path: string;
  degree: number;
  kind: VaultNodeKind;
  onStartChat: (
    notePath: string,
    nodeId: string,
    kind: VaultNodeKind,
    forceNew?: boolean,
    side?: BranchSide
  ) => void;
  [key: string]: unknown;
}

/**
 * Rounded card with the note title inside.
 * Single click → open chat (reopens the thread for saved chat notes).
 * Double click → open the note. Hover “+” on either edge → branch a new
 * chat out of that side.
 */
export function NoteNode({ id, data }: NodeProps) {
  const d = data as NoteNodeData;
  const { app } = usePluginCtx();
  const clickTimer = useRef<number | null>(null);

  const openNote = () => {
    const file = app.vault.getAbstractFileByPath(d.path);
    if (file) app.workspace.getLeaf("tab").openFile(file as any);
  };

  const cancelPendingClick = () => {
    if (clickTimer.current !== null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
  };

  const plusBtn = (side: BranchSide) => (
    <button
      className={`gc-plus-btn gc-plus-${side}`}
      title="Branch a new chat from this side"
      onClick={(e) => {
        e.stopPropagation();
        cancelPendingClick();
        d.onStartChat(d.path, id, d.kind, true, side);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      +
    </button>
  );

  return (
    <div className="gc-note-node">
      <Handle type="source" position={Position.Right} className="gc-handle" />
      <Handle type="target" position={Position.Left} className="gc-handle" />
      <Handle
        type="source"
        id="plus-left"
        position={Position.Left}
        className="gc-handle"
      />
      <Handle
        type="source"
        id="plus-right"
        position={Position.Right}
        className="gc-handle"
      />
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
          cancelPendingClick();
          openNote();
        }}
        title={`${d.path}\nclick: chat · double-click: open note`}
      >
        <span className="gc-note-title">{d.label}</span>
        {plusBtn("left")}
        {plusBtn("right")}
      </div>
    </div>
  );
}
