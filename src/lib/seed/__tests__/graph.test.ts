import { describe, expect, it } from "vitest";
import { polylinesToGraph } from "@/lib/seed/graph";

describe("polylinesToGraph", () => {
  it("splits at crossings and T-junctions", () => {
    const g = polylinesToGraph([
      { points: [[0, 0], [10, 0]] },
      { points: [[5, -5], [5, 5]] }, // crossing at (5,0)
      { points: [[8, 0], [8, 3]] }, // T-junction at (8,0)
    ]);
    const keys = g.nodes.map((n) => n.key).sort();
    expect(keys).toContain("5,0");
    expect(keys).toContain("8,0");
    expect(g.nodes.length).toBe(7);
    expect(g.edges.length).toBe(6);
    const deg = new Map<string, number>();
    for (const e of g.edges) { deg.set(e.from, (deg.get(e.from) ?? 0) + 1); deg.set(e.to, (deg.get(e.to) ?? 0) + 1); }
    expect(deg.get("5,0")).toBe(4);
    expect(deg.get("8,0")).toBe(3);
  });
  it("carries flags and dedupes", () => {
    const g = polylinesToGraph([{ points: [[0, 0], [1, 0]], accessible: false, weight: 0.5 }, { points: [[0, 0], [1, 0]] }]);
    expect(g.edges.length).toBe(1);
    expect(g.edges[0].accessible).toBe(false);
    expect(g.edges[0].weight).toBe(0.5);
  });
});
