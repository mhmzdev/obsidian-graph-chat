import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFolder,
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
  /** true → every vault folder is in the graph */
  includeAll: boolean;
  /** Vault folders included in the graph when includeAll is off. */
  includeFolders: string[];
  tagsFolder: string;
  /** models offered in the chat dropdown; first entry is the default */
  models: ModelOption[];
  /** per-source-folder chat storage: notes under sourceFolder save chats to chatsFolder */
  chatRoutes: ChatRoute[];
  /** folders opted OUT of per-folder chats (their chats go to the root default) */
  perFolderChatsOff: string[];
  /** false → notes never collapse into folder-overview cards, regardless of zoom */
  folderCollapseEnabled: boolean;
  /** zoom level (0.05–1) below which the canvas collapses to folder cards */
  folderCollapseThreshold: number;
}

export const KNOWN_MODELS: ModelOption[] = [
  { label: "Sonnet", value: "sonnet" },
  { label: "Fable 5", value: "claude-fable-5" },
  { label: "Opus", value: "opus" },
  { label: "Haiku", value: "haiku" },
];

const DEFAULT_SETTINGS: GraphChatSettings = {
  claudePath: "claude", // set an absolute path in settings if PATH lookup fails
  chatsFolder: "Chats",
  includeAll: false,
  includeFolders: ["0 - Everything", "Tags", "Chats"],
  tagsFolder: "Tags",
  models: [
    { label: "Sonnet", value: "sonnet" },
    { label: "Fable 5", value: "claude-fable-5" },
    { label: "Opus", value: "opus" },
    { label: "Haiku", value: "haiku" },
  ],
  chatRoutes: [],
  perFolderChatsOff: [],
  folderCollapseEnabled: true,
  folderCollapseThreshold: 0.3,
};

/** Every folder that stores chat notes (default + routed). */
export function allChatFolders(s: GraphChatSettings): string[] {
  return [s.chatsFolder, ...s.chatRoutes.map((r) => r.chatsFolder)];
}

/** Basename used for per-folder chat subfolders (default "Chats"). */
export function chatsSubfolderName(s: GraphChatSettings): string {
  return s.chatsFolder.split("/").pop() || "Chats";
}

/** Is this vault path a chat note? Covers the root default folder, routed
 * folders, and any per-folder `<folder>/Chats/` subfolder. */
export function isChatPath(s: GraphChatSettings, path: string): boolean {
  if (path.startsWith(s.chatsFolder + "/")) return true;
  if (
    s.chatRoutes.some(
      (r) => r.chatsFolder && path.startsWith(r.chatsFolder + "/")
    )
  )
    return true;
  const parts = path.split("/");
  return parts.length >= 3 && parts.slice(1, -1).includes(chatsSubfolderName(s));
}

/** Where a chat for this source note should be stored.
 * Explicit routes win (longest match), then per-folder `<folder>/Chats`
 * unless that folder is toggled off, then the root default. */
export function resolveChatsFolder(
  s: GraphChatSettings,
  sourceNotePath: string
): string {
  let best: ChatRoute | null = null;
  for (const r of s.chatRoutes) {
    if (!r.sourceFolder || !r.chatsFolder) continue;
    if (
      sourceNotePath.startsWith(r.sourceFolder + "/") &&
      (!best || r.sourceFolder.length > best.sourceFolder.length)
    ) {
      best = r;
    }
  }
  if (best) return best.chatsFolder;
  const top = sourceNotePath.includes("/") ? sourceNotePath.split("/")[0] : "";
  if (
    top &&
    top !== s.tagsFolder &&
    top !== s.chatsFolder.split("/")[0] &&
    !s.perFolderChatsOff.includes(top)
  ) {
    return `${top}/${chatsSubfolderName(s)}`;
  }
  return s.chatsFolder;
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
      id: "open-view",
      name: "Open view",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new GraphChatSettingTab(this.app, this));
  }

  async activateView() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_GRAPH_CHAT);
    if (existing.length > 0) {
      await workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_GRAPH_CHAT, active: true });
    await workspace.revealLeaf(leaf);
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
    const S = this.plugin.settings;
    const save = () => this.plugin.saveSettings();

    const folders = this.app.vault
      .getAllLoadedFiles()
      .filter((f): f is TFolder => f instanceof TFolder)
      .map((f) => f.path)
      .filter((p) => p && p !== "/" && !p.startsWith("."))
      .sort();
    const topLevel = folders.filter((p) => !p.includes("/"));

    containerEl.createEl("p", {
      text: "Reopen the Graph Chat view after changing settings.",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Claude CLI path")
      .setDesc("Absolute path to the claude binary (run `which claude`).")
      .addText((t) =>
        t.setValue(S.claudePath).onChange(async (v) => {
          S.claudePath = v.trim();
          await save();
        })
      );

    new Setting(containerEl)
      .setName("Default chats folder")
      .setDesc("Where chat notes are saved unless a routing rule matches.")
      .addDropdown((dd) => {
        for (const f of folders) dd.addOption(f, f);
        if (!folders.includes(S.chatsFolder))
          dd.addOption(S.chatsFolder, S.chatsFolder + " (will be created)");
        dd.setValue(S.chatsFolder).onChange(async (v) => {
          S.chatsFolder = v;
          await save();
        });
      });

    // ---- per-folder chats: on by default, opt out per folder ----
    new Setting(containerEl)
      .setName("Per-folder chats")
      .setDesc(
        "By default every folder keeps its chats in its own <folder>/" +
          chatsSubfolderName(S) +
          " subfolder. Toggle a folder off to store its chats in the default folder instead. Explicit routing rules below override both."
      )
      .setHeading();

    for (const f of topLevel) {
      if (f === S.tagsFolder || f === S.chatsFolder.split("/")[0]) continue;
      new Setting(containerEl)
        .setName(f)
        .setDesc(`${f}/${chatsSubfolderName(S)}`)
        .addToggle((tg) =>
          tg
            .setValue(!S.perFolderChatsOff.includes(f))
            .onChange(async (on) => {
              if (on) {
                S.perFolderChatsOff = S.perFolderChatsOff.filter(
                  (x) => x !== f
                );
              } else if (!S.perFolderChatsOff.includes(f)) {
                S.perFolderChatsOff.push(f);
              }
              await save();
            })
        );
    }

    // ---- chat folder routing: table of rules ----
    new Setting(containerEl)
      .setName("Chat folder routing")
      .setDesc(
        "Chats started from notes under the source folder are stored in the destination folder (created if missing). Longest match wins; everything else uses the default folder."
      )
      .setHeading();

    S.chatRoutes.forEach((r, i) => {
      new Setting(containerEl)
        .addDropdown((dd) => {
          dd.addOption("", "— source folder —");
          for (const f of folders) dd.addOption(f, f);
          dd.setValue(r.sourceFolder).onChange(async (v) => {
            r.sourceFolder = v;
            await save();
          });
        })
        .addText((t) =>
          t
            .setPlaceholder("destination, e.g. 0 - Everything/research")
            .setValue(r.chatsFolder)
            .onChange(async (v) => {
              r.chatsFolder = v.trim().replace(/\/$/, "");
              await save();
            })
        )
        .addExtraButton((b) =>
          b
            .setIcon("trash")
            .setTooltip("Remove rule")
            .onClick(async () => {
              S.chatRoutes.splice(i, 1);
              await save();
              this.display();
            })
        );
    });

    new Setting(containerEl).addButton((b) =>
      b.setButtonText("Add routing rule").onClick(async () => {
        S.chatRoutes.push({ sourceFolder: "", chatsFolder: "" });
        await save();
        this.display();
      })
    );

    // ---- models: toggle checklist + custom entries ----
    new Setting(containerEl)
      .setName("Models")
      .setDesc(
        "Toggle the models offered in the chat dropdown. Other CLIs (Codex, GLM, …) need provider adapters — planned, not available yet."
      )
      .setHeading();

    const isEnabled = (value: string) =>
      S.models.some((m) => m.value === value);

    for (const km of KNOWN_MODELS) {
      new Setting(containerEl)
        .setName(km.label)
        .setDesc(km.value)
        .addToggle((tg) =>
          tg.setValue(isEnabled(km.value)).onChange(async (on) => {
            if (on) {
              if (!isEnabled(km.value)) S.models.push({ ...km });
            } else {
              if (S.models.length <= 1) {
                new Notice("At least one model must stay enabled.");
                tg.setValue(true);
                return;
              }
              S.models = S.models.filter((m) => m.value !== km.value);
            }
            await save();
            this.display();
          })
        );
    }

    const customs = S.models.filter(
      (m) => !KNOWN_MODELS.some((km) => km.value === m.value)
    );
    for (const cm of customs) {
      new Setting(containerEl)
        .setName(cm.label)
        .setDesc(cm.value + " (custom)")
        .addExtraButton((b) =>
          b
            .setIcon("trash")
            .setTooltip("Remove custom model")
            .onClick(async () => {
              if (S.models.length <= 1) {
                new Notice("At least one model must stay enabled.");
                return;
              }
              S.models = S.models.filter((m) => m.value !== cm.value);
              await save();
              this.display();
            })
        );
    }

    let customLabel = "";
    let customId = "";
    new Setting(containerEl)
      .setName("Add custom model")
      .addText((t) =>
        t.setPlaceholder("Label").onChange((v) => (customLabel = v.trim()))
      )
      .addText((t) =>
        t
          .setPlaceholder("model id for --model")
          .onChange((v) => (customId = v.trim()))
      )
      .addButton((b) =>
        b.setButtonText("Add").onClick(async () => {
          if (!customLabel || !customId) return;
          if (!isEnabled(customId)) {
            S.models.push({ label: customLabel, value: customId });
            await save();
            this.display();
          }
        })
      );

    new Setting(containerEl)
      .setName("Default model")
      .setDesc("Pre-selected in every new chat.")
      .addDropdown((dd) => {
        for (const m of S.models) dd.addOption(m.value, m.label);
        dd.setValue(S.models[0]?.value ?? "").onChange(async (v) => {
          const idx = S.models.findIndex((m) => m.value === v);
          if (idx > 0) {
            const [m] = S.models.splice(idx, 1);
            S.models.unshift(m);
            await save();
          }
        });
      });

    // ---- included folders: all vs selected checklist ----
    new Setting(containerEl)
      .setName("Included folders")
      .setDesc(
        "Which folders appear in the graph. Tags and chat folders are always included."
      )
      .setHeading();

    new Setting(containerEl)
      .setName("Include all folders")
      .addToggle((tg) =>
        tg.setValue(S.includeAll).onChange(async (v) => {
          S.includeAll = v;
          await save();
          this.display();
        })
      );

    if (!S.includeAll) {
      for (const f of topLevel) {
        if (f === S.tagsFolder) continue;
        new Setting(containerEl).setName(f).addToggle((tg) =>
          tg.setValue(S.includeFolders.includes(f)).onChange(async (on) => {
            if (on) {
              if (!S.includeFolders.includes(f)) S.includeFolders.push(f);
            } else {
              S.includeFolders = S.includeFolders.filter((x) => x !== f);
            }
            await save();
          })
        );
      }
    }

    // ---- canvas: semantic zoom (folder collapse) ----
    new Setting(containerEl)
      .setName("Canvas")
      .setDesc(
        "Controls the semantic zoom that collapses notes into one card per top-level folder when zoomed far out."
      )
      .setHeading();

    new Setting(containerEl)
      .setName("Collapse to folders when zoomed out")
      .setDesc("Turn off to always show individual notes, at any zoom level.")
      .addToggle((tg) =>
        tg.setValue(S.folderCollapseEnabled).onChange(async (v) => {
          S.folderCollapseEnabled = v;
          await save();
          this.display();
        })
      );

    if (S.folderCollapseEnabled) {
      new Setting(containerEl)
        .setName("Folder collapse threshold")
        .setDesc(
          "Zoom level below which the canvas collapses to folder cards. Lower means you have to zoom out further first."
        )
        .addSlider((s) =>
          s
            .setLimits(0.05, 1, 0.01)
            .setValue(S.folderCollapseThreshold)
            .setDynamicTooltip()
            .onChange(async (v) => {
              S.folderCollapseThreshold = v;
              await save();
            })
        );
    }
  }
}
