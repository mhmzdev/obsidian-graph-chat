import { createContext, useContext } from "react";
import type { App } from "obsidian";
import type GraphChatPlugin from "../main";

export interface PluginCtx {
  app: App;
  plugin: GraphChatPlugin;
}

export const PluginContext = createContext<PluginCtx | null>(null);

export function usePluginCtx(): PluginCtx {
  const ctx = useContext(PluginContext);
  if (!ctx) throw new Error("PluginContext missing");
  return ctx;
}
