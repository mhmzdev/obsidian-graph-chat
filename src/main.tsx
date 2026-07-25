import { Plugin, WorkspaceLeaf } from "obsidian";
import { GraphChatView, VIEW_TYPE_GRAPH_CHAT } from "./view";

export interface GraphChatSettings {
  claudePath: string;
  chatsFolder: string;
  /** Vault folders included in the graph. Tags folder renders as hub nodes. */
  includeFolders: string[];
  tagsFolder: string;
}

const DEFAULT_SETTINGS: GraphChatSettings = {
  claudePath: "/Users/hamza/.local/bin/claude",
  chatsFolder: "Chats",
  includeFolders: ["0 - Everything", "Tags", "Chats"],
  tagsFolder: "Tags",
};

export default class GraphChatPlugin extends Plugin {
  settings: GraphChatSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_GRAPH_CHAT,
      (leaf: WorkspaceLeaf) => new GraphChatView(leaf, this)
    );

    this.addRibbonIcon("message-circle", "Open Graph Chat", () =>
      this.activateView()
    );

    this.addCommand({
      id: "open-graph-chat",
      name: "Open Graph Chat view",
      callback: () => this.activateView(),
    });
  }

  async activateView() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_GRAPH_CHAT);
    if (existing.length > 0) {
      workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_GRAPH_CHAT, active: true });
    workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
