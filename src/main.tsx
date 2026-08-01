import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  WorkspaceLeaf,
} from "obsidian";
import { GraphChatView, VIEW_TYPE_GRAPH_CHAT } from "./view";

export interface ModelOption {
  label: string;
  value: string;
}

export interface ChatRoute {
  sourceFolder: string;
  chatsFolder: string;
}

export interface GraphChatSettings {
  claudePath: string;
  chatsFolder: string;
  /** Vault folders included in the graph. Tags folder renders as hub nodes. */
  includeFolders: string[];
  tagsFolder: string;
  /** models offered in the chat dropdown; first entry is the default */
  models: ModelOption[];
  /** per-source-folder chat storage: notes under sourceFolder save chats to chatsFolder */
  chatRoutes: ChatRoute[];
}

const DEFAULT_SETTINGS: GraphChatSettings = {
  claudePath: "/Users/hamza/.local/bin/claude",
  chatsFolder: "Chats",
  includeFolders: ["0 - Everything", "Tags", "Chats"],
  tagsFolder: "Tags",
  models: [
    { label: "Sonnet", value: "sonnet" },
    { label: "Fable 5", value: "claude-fable-5" },
    { label: "Opus", value: "opus" },
    { label: "Haiku", value: "haiku" },
  ],
  chatRoutes: [],
};

/** Every folder that stores chat notes (default + routed). */
export function allChatFolders(s: GraphChatSettings): string[] {
  return [s.chatsFolder, ...s.chatRoutes.map((r) => r.chatsFolder)];
}

/** Where a chat for this source note should be stored. Longest match wins. */
export function resolveChatsFolder(
  s: GraphChatSettings,
  sourceNotePath: string
): string {
  let best: ChatRoute | null = null;
  for (const r of s.chatRoutes) {
    if (
      sourceNotePath.startsWith(r.sourceFolder + "/") &&
      (!best || r.sourceFolder.length > best.sourceFolder.length)
    ) {
      best = r;
    }
  }
  return best?.chatsFolder ?? s.chatsFolder;
}

export default class GraphChatPlugin extends Plugin {
  settings: GraphChatSettings = DEFAULT_SETTINGS;
  /** persisted canvas positions, keyed by node id (vault path) */
  positions: Record<string, { x: number; y: number }> = {};

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

    this.addSettingTab(new GraphChatSettingTab(this.app, this));
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
    const data = ((await this.loadData()) ?? {}) as Record<string, unknown>;
    this.positions =
      (data.positions as Record<string, { x: number; y: number }>) ?? {};
    delete data.positions;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    if (!this.settings.models || this.settings.models.length === 0) {
      this.settings.models = DEFAULT_SETTINGS.models;
    }
  }

  async saveSettings() {
    await this.saveData({ ...this.settings, positions: this.positions });
  }

  async savePositions() {
    await this.saveSettings();
  }
}

class GraphChatSettingTab extends PluginSettingTab {
  plugin: GraphChatPlugin;

  constructor(app: App, plugin: GraphChatPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("p", {
      text: "Reopen the Graph Chat view after changing settings.",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Claude CLI path")
      .setDesc("Absolute path to the claude binary (run `which claude`).")
      .addText((t) =>
        t.setValue(this.plugin.settings.claudePath).onChange(async (v) => {
          this.plugin.settings.claudePath = v.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Default chats folder")
      .setDesc("Where chat notes are saved unless a routing rule matches.")
      .addText((t) =>
        t.setValue(this.plugin.settings.chatsFolder).onChange(async (v) => {
          this.plugin.settings.chatsFolder = v.trim() || "Chats";
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Chat folder routing")
      .setDesc(
        "One rule per line: source-folder -> chats-folder. Chats started from notes under source-folder are stored in chats-folder. Longest match wins; anything else uses the default folder. Example: 0 - Everything -> 0 - Everything/research"
      )
      .addTextArea((t) => {
        t.setValue(
          this.plugin.settings.chatRoutes
            .map((r) => `${r.sourceFolder} -> ${r.chatsFolder}`)
            .join("\n")
        ).onChange(async (v) => {
          this.plugin.settings.chatRoutes = v
            .split("\n")
            .map((line) => line.split("->"))
            .filter((parts) => parts.length === 2)
            .map(([a, b]) => ({
              sourceFolder: a.trim().replace(/\/$/, ""),
              chatsFolder: b.trim().replace(/\/$/, ""),
            }))
            .filter((r) => r.sourceFolder && r.chatsFolder);
          await this.plugin.saveSettings();
        });
        t.inputEl.rows = 4;
        t.inputEl.style.width = "100%";
      });

    new Setting(containerEl)
      .setName("Models")
      .setDesc(
        "One per line: Label = model-id (passed to claude --model). First entry is the default. Aliases like sonnet/opus/haiku or full ids like claude-fable-5 both work. Other CLIs (Codex, GLM, …) need provider adapters — planned, not available yet."
      )
      .addTextArea((t) => {
        t.setValue(
          this.plugin.settings.models
            .map((m) => `${m.label} = ${m.value}`)
            .join("\n")
        ).onChange(async (v) => {
          const models = v
            .split("\n")
            .map((line) => line.split("="))
            .filter((parts) => parts.length === 2)
            .map(([a, b]) => ({ label: a.trim(), value: b.trim() }))
            .filter((m) => m.label && m.value);
          if (models.length > 0) {
            this.plugin.settings.models = models;
            await this.plugin.saveSettings();
          }
        });
        t.inputEl.rows = 5;
        t.inputEl.style.width = "100%";
      });

    new Setting(containerEl)
      .setName("Included folders")
      .setDesc(
        "Comma-separated top-level folders shown in the graph (chat folders are always included)."
      )
      .addText((t) =>
        t
          .setValue(this.plugin.settings.includeFolders.join(", "))
          .onChange(async (v) => {
            this.plugin.settings.includeFolders = v
              .split(",")
              .map((s) => s.trim().replace(/\/$/, ""))
              .filter(Boolean);
            await this.plugin.saveSettings();
          })
      );
  }
}
