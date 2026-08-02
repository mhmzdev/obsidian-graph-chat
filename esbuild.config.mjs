import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";
import { readFileSync, writeFileSync } from "fs";

const prod = process.argv[2] === "production";

// Obsidian only loads styles.css — bundle React Flow's base styles with ours.
const cssBundle = {
  name: "css-bundle",
  setup(build) {
    build.onEnd(() => {
      const xyflow = readFileSync(
        "node_modules/@xyflow/react/dist/style.css",
        "utf8"
      );
      const ours = readFileSync("src/styles.css", "utf8");
      writeFileSync("styles.css", xyflow + "\n\n" + ours);
    });
  },
};

const ctx = await esbuild.context({
  entryPoints: ["src/main.tsx"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    ...builtinModules,
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  define: {
    "process.env.NODE_ENV": prod ? '"production"' : '"development"',
  },
  plugins: [cssBundle],
});

if (prod) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
