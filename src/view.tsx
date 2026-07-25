import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { StrictMode } from "react";
import type GraphChatPlugin from "./main";
import { GraphCanvas } from "./components/GraphCanvas";

export const VIEW_TYPE_GRAPH_CHAT = "graph-chat-view";

export class GraphChatView extends ItemView {
  plugin: GraphChatPlugin;
  root: Root | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: GraphChatPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_GRAPH_CHAT;
  }

  getDisplayText() {
    return "Graph Chat";
  }

  getIcon() {
    return "message-circle";
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("graph-chat-root");
    this.root = createRoot(this.contentEl);
    this.root.render(
      <StrictMode>
        <GraphCanvas app={this.app} plugin={this.plugin} />
      </StrictMode>
    );
  }

  async onClose() {
    this.root?.unmount();
    this.root = null;
  }
}
