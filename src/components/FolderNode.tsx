import { Handle, Position, NodeProps } from "@xyflow/react";
import { Icon } from "./ChatCardNode";

export interface FolderNodeData {
  name: string;
  count: number;
  countLabel: string;
  onOpen: (folderId: string) => void;
  [key: string]: unknown;
}

/**
 * Semantic-zoom overview card: one card per top-level folder when the canvas
 * is zoomed far out. Click to dive back into that folder's nodes.
 */
export function FolderNode({ id, data }: NodeProps) {
  const d = data as FolderNodeData;
  return (
    <div className="gc-folder-node" onClick={() => d.onOpen(id)}>
      <Handle type="source" position={Position.Right} className="gc-handle" />
      <Handle type="target" position={Position.Left} className="gc-handle" />
      <div className="gc-folder-icon">
        <Icon name="folder" size={34} />
      </div>
      <div className="gc-folder-name">{d.name}</div>
      <div className="gc-folder-count">
        {d.count} {d.countLabel}
      </div>
    </div>
  );
}
