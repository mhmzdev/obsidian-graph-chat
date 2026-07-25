import { Handle, Position, NodeProps } from "@xyflow/react";

export interface TagNodeData {
  label: string;
  path: string;
  degree: number;
  [key: string]: unknown;
}

/**
 * Tag pages are ToC/hub anchors — never chattable, but they participate in
 * linking: drag from a tag's edge dot onto a note to tag that note, or drop
 * a dragged connection onto the pill.
 */
export function TagNode({ data }: NodeProps) {
  const d = data as TagNodeData;
  return (
    <div className="gc-tag-node">
      <Handle type="source" position={Position.Right} className="gc-handle" />
      <Handle type="target" position={Position.Left} className="gc-handle" />
      <Handle
        type="target"
        id="drop"
        position={Position.Left}
        className="gc-drop-target"
        isConnectableStart={false}
      />
      <Handle
        type="source"
        id="plus-left"
        position={Position.Left}
        className="gc-plus-handle gc-plus-mini gc-plus-left"
        title="Drag onto a note to tag it"
      >
        <span className="gc-plus-glyph">+</span>
      </Handle>
      <Handle
        type="source"
        id="plus-right"
        position={Position.Right}
        className="gc-plus-handle gc-plus-mini gc-plus-right"
        title="Drag onto a note to tag it"
      >
        <span className="gc-plus-glyph">+</span>
      </Handle>
      <span className="gc-tag-pill" title="Tag hub — drag its + onto a note to tag it">
        #{d.label}
      </span>
    </div>
  );
}
