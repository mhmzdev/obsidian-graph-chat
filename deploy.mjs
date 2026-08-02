import { cpSync, mkdirSync } from "fs";
import { join } from "path";

// Local dev helper: copies the built plugin into your vault.
// Set OBSIDIAN_VAULT to your vault path, e.g.
//   OBSIDIAN_VAULT="/path/to/My Vault" npm run deploy
const VAULT =
  process.env.OBSIDIAN_VAULT ??
  "/Users/hamza/Library/CloudStorage/GoogleDrive-hamza.6.shakeel@gmail.com/My Drive/Obsidian/My Vault";
const DEST = join(VAULT, ".obsidian", "plugins", "graph-chat");

mkdirSync(DEST, { recursive: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) {
  cpSync(f, join(DEST, f));
}
console.log("Deployed to", DEST);
