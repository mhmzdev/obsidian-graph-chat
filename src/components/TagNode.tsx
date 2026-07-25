import { Handle, Position, NodeProps } from "@xyflow/react";

export interface TagNodeData {
  label: string;
  degree: number;
  [key: string]: unknown;
}

/**
 * Tag pages are ToC/hub anchors — visually distinct, never chattable.
 */
export function TagNode({ data }: NodeProps) {
  const d = data as TagNodeData;
  return (
    <div className="gc-tag-node" title="Tag hub — table of contents, not chattable">
      <Handle type="source" position={Position.Right} className="gc-handle" />
      <Handle type="target" position={Position.Left} className="gc-handle" />
      <span className="gc-tag-pill">#{d.label}</span>
    </div>
  );
}
