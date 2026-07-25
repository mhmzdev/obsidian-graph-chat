import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  SimulationNodeDatum,
} from "d3-force";
import type { VaultGraph } from "./buildGraph";

interface SimNode extends SimulationNodeDatum {
  id: string;
}

export interface Positions {
  [id: string]: { x: number; y: number };
}

/**
 * Run a force simulation synchronously and return static positions.
 * Good enough for a prototype; live physics can come later.
 */
export function layoutGraph(graph: VaultGraph): Positions {
  const simNodes: SimNode[] = graph.nodes.map((n) => ({ id: n.id }));
  const simLinks = graph.edges.map((e) => ({
    source: e.source,
    target: e.target,
  }));

  const sim = forceSimulation(simNodes)
    .force(
      "link",
      forceLink(simLinks)
        .id((d: any) => d.id)
        .distance(140)
        .strength(0.4)
    )
    .force("charge", forceManyBody().strength(-320))
    .force("center", forceCenter(0, 0))
    .force("collide", forceCollide(46))
    .stop();

  const ticks = Math.min(
    300,
    Math.ceil(Math.log(sim.alphaMin()) / Math.log(1 - sim.alphaDecay()))
  );
  for (let i = 0; i < ticks; i++) sim.tick();

  const positions: Positions = {};
  for (const n of simNodes) {
    positions[n.id] = { x: n.x ?? 0, y: n.y ?? 0 };
  }
  return positions;
}
