import { App, Modal } from "obsidian";

/** Obsidian-styled confirm dialog. Resolves true only on explicit confirm. */
export function confirmDialog(
  app: App,
  title: string,
  message: string,
  confirmLabel = "Delete"
): Promise<boolean> {
  return new Promise((resolve) => {
    class ConfirmModal extends Modal {
      onOpen() {
        this.titleEl.setText(title);
        this.contentEl.createEl("p", { text: message });
        const row = this.contentEl.createDiv({
          cls: "modal-button-container",
        });
        const ok = row.createEl("button", {
          text: confirmLabel,
          cls: "mod-warning",
        });
        ok.onclick = () => {
          resolve(true);
          this.close();
        };
        const cancel = row.createEl("button", { text: "Cancel" });
        cancel.onclick = () => {
          resolve(false);
          this.close();
        };
      }
      onClose() {
        resolve(false);
      }
    }
    new ConfirmModal(app).open();
  });
}
