import { cpSync, mkdirSync } from "fs";
import { join } from "path";

const VAULT =
  "/Users/hamza/Library/CloudStorage/GoogleDrive-hamza.6.shakeel@gmail.com/My Drive/Obsidian/My Vault";
const DEST = join(VAULT, ".obsidian", "plugins", "graph-chat");

mkdirSync(DEST, { recursive: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) {
  cpSync(f, join(DEST, f));
}
console.log("Deployed to", DEST);
