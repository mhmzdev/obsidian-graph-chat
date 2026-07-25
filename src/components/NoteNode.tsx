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
 * Single click → open chat(s). Double click → open the note.
 * The “+” on each edge is a React Flow handle: CLICK it to branch a chat,
 * DRAG it to another node to create a real [[wikilink]] between the notes.
 * The whole card is a drop target while a connection is being dragged.
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

  const plusHandle = (side: BranchSide) => (
    <Handle
      type="source"
      id={`plus-${side}`}
      position={side === "left" ? Position.Left : Position.Right}
      className={`gc-plus-handle gc-plus-${side}`}
      title="Click: branch a chat · Drag: link to another node"
      onClick={(e) => {
        e.stopPropagation();
        cancelPendingClick();
        d.onStartChat(d.path, id, d.kind, true, side);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <span className="gc-plus-glyph">+</span>
    </Handle>
  );

  return (
    <div className="gc-note-node">
      {/* invisible anchors for regular graph edges */}
      <Handle type="source" position={Position.Right} className="gc-handle" />
      <Handle type="target" position={Position.Left} className="gc-handle" />
      {/* full-card drop target, active only while a connection is dragged */}
      <Handle
        type="target"
        id="drop"
        position={Position.Left}
        className="gc-drop-target"
        isConnectableStart={false}
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
        {plusHandle("left")}
        {plusHandle("right")}
      </div>
    </div>
  );
}
