import { describe, expect, it, vi } from "vitest";
import { SDK_EVENTS, SDK_METHODS } from "@/lib/sdk-protocol";
import { ViewerController } from "./controller";
import { testBundle } from "./fixtures";

function make(params: Record<string, string> = {}) {
  return new ViewerController({ bundle: testBundle(), slug: "test-event", params, origin: "https://maps.example.com" });
}

describe("ViewerController", () => {
  it("implements every SDK method", () => {
    const c = make();
    const missing = SDK_METHODS.filter((m) => typeof (c as unknown as Record<string, unknown>)[m] !== "function");
    expect(missing).toEqual([]);
  });

  it("dispatches by name and rejects unknown methods", async () => {
    const c = make();
    expect(await c.call("getLanguage")).toBe("en");
    expect(await c.call("getFloors")).toHaveLength(2);
    await expect(c.call("nope" as never)).rejects.toThrow(/Unknown method/);
  });

  it("selectBooth resolves labels, ids and external ids and opens the single exhibitor", () => {
    const c = make();
    const details = vi.fn();
    c.on("details", details);
    c.selectBooth("a1");
    expect(c.snapshot().panel).toEqual({ kind: "exhibitor", id: "ex_acme" });
    expect(c.snapshot().selectedBoothIds).toEqual(["bo_a1"]);
    expect(details).toHaveBeenCalled();
    c.selectBooth("ext-a1");
    expect(c.snapshot().selectedBoothIds).toEqual(["bo_a1"]);
    c.selectBooth("bo_a2");
    expect(c.snapshot().panel).toEqual({ kind: "booth", id: "bo_a2" });
    c.selectBooth(["A1", "B1"]);
    expect(c.snapshot().selectedBoothIds).toEqual(["bo_a1", "bo_b1"]);
    expect(() => c.selectBooth("ZZ9")).toThrow(/not found/);
  });

  it("select falls through booth → exhibitor → category → session", () => {
    const c = make();
    c.select("beta-cloud");
    expect(c.snapshot().panel).toEqual({ kind: "exhibitor", id: "ex_beta" });
    c.select("Cloud");
    expect(c.snapshot().categoryIds).toEqual(["ca_cloud"]);
    c.select("sess-1");
    expect(c.snapshot().panel).toEqual({ kind: "session", id: "se_1" });
  });

  it("routes from the default entrance, honours accessibility and waypoint arrays", () => {
    const c = make();
    const direction = vi.fn();
    c.on("direction", direction);
    const r = c.selectRoute("A1") as { distanceM: number; levelIds: string[] };
    expect(r.distanceM).toBeGreaterThan(0);
    expect(c.snapshot().route?.from).toEqual({ type: "element", id: "el_entrance" });
    expect(direction).toHaveBeenCalledTimes(1);
    // Multi-level: escalator is not accessible, lift is.
    const fast = c.selectRoute("A1", "T1") as { levelIds: string[]; steps: { transition: { kind: string } | null }[] };
    expect(fast.levelIds).toEqual(["lv_1", "lv_2"]);
    expect(fast.steps.some((s) => s.transition?.kind === "escalator")).toBe(true);
    const acc = c.selectAccessibleRoute("A1", "T1") as { steps: { transition: { kind: string } | null }[] };
    expect(acc.steps.some((s) => s.transition?.kind === "elevator")).toBe(true);
    expect(acc.steps.some((s) => s.transition?.kind === "escalator")).toBe(false);
    const multi = c.selectRoute(["A1", "B1", "A2"]) as { toLabel: string };
    expect(c.snapshot().routeRequest?.via).toEqual([{ type: "booth", id: "bo_b1" }]);
    expect(multi.toLabel).toContain("A2");
    const cleared = vi.fn();
    c.on("routeCleared", cleared);
    c.clearRoute();
    expect(c.snapshot().route).toBeNull();
    expect(cleared).toHaveBeenCalled();
    expect(direction).toHaveBeenLastCalledWith(null);
  });

  it("applies deep-link parameters (route, level, lang, category, position, hide)", () => {
    const c = make({ route: "A1,B1", accessible: "1", lang: "de", level: "L2", category: "AI & Data", position: "5,5,L1", hide: "controls,levels", view: "3d" });
    const s = c.snapshot();
    expect(s.locale).toBe("de");
    expect(s.route?.accessible).toBe(true);
    expect(s.categoryIds).toEqual(["ca_ai"]);
    expect(s.position).toEqual({ levelId: "lv_1", x: 5, y: 5 });
    expect(s.visibility.controls).toBe(false);
    expect(s.visibility.levels).toBe(false);
    expect(s.view).toBe("3d");
    // Route wins over `level` for the displayed level.
    expect(s.levelId).toBe("lv_1");
    const url = c.urlParams();
    expect(url.route).toBe("A1,B1");
    expect(url.accessible).toBe("1");
    expect(url.lang).toBe("de");
    expect(url.hide).toBe("controls,levels");
    expect(c.shareUrl()).toContain("https://maps.example.com/e/test-event?");
    expect(c.shareUrl()).not.toContain("hide=");
  });

  it("bookmarks round-trip and optimises the plan", () => {
    const c = make();
    const changed = vi.fn();
    c.on("bookmarksChanged", changed);
    c.setBookmarks(["acme-robotics", "B1", "T1"]);
    expect(c.getBookmarks().map((b) => b.name)).toEqual(["Acme Robotics", "B1", "T1"]);
    expect(changed).toHaveBeenCalled();
    c.setEntitiesBookmarks([{ type: "exhibitor", name: "Acme Robotics", bookmarked: false }]);
    expect(c.getBookmarks()).toHaveLength(2);
    const opt = c.optimisePlan();
    expect(opt?.order).toHaveLength(2);
    expect(c.snapshot().route?.steps.length).toBeGreaterThan(0);
    const viaSdk = c.getOptimizedRoutes(["A2", "A1"]) as { order: string[] };
    expect(viaSdk.order.sort()).toEqual(["A1", "A2"]);
  });

  it("category colouring, highlights, markers, circles and visibility", () => {
    const c = make();
    c.selectCategory("ca_ai");
    expect(c.snapshot().categoryIds).toEqual(["ca_ai"]);
    c.selectCategory("Cloud", { toggle: true });
    expect(c.snapshot().categoryIds).toEqual(["ca_ai", "ca_cloud"]);
    c.clearCategory();
    expect(c.snapshot().categoryIds).toEqual([]);
    c.highlightExhibitors(["gamma-labs"]);
    expect(c.snapshot().highlightedBoothIds).toEqual(["bo_b1"]);
    c.setMarkers([{ id: "m1", x: 1, y: 2 }, { id: "bad", x: NaN, y: 1 }]);
    expect(c.snapshot().markers).toHaveLength(1);
    c.drawCircles([{ x: 1, y: 1, radius: 5 }]);
    expect(c.snapshot().circles).toHaveLength(1);
    c.setVisibility({ header: false });
    expect(c.getVisibility().header).toBe(false);
    expect(c.urlParams().hide).toBe("header");
  });

  it("lists, geometry and misc getters", () => {
    const c = make();
    expect(c.boothsList()).toHaveLength(4);
    expect(c.exhibitorsList()).toHaveLength(4);
    expect((c.categoriesList() as { count: number }[]).map((x) => x.count)).toEqual([2, 2]);
    expect(c.sessionsList()).toHaveLength(1);
    expect(c.getBoothRect("A1")).toMatchObject({ x: 10, y: 10, width: 8, height: 8 });
    expect(c.getVersion()).toEqual({ version: 3, sdk: 1, generatedAt: "2026-01-01T00:00:00.000Z" });
    const [lng, lat] = c.convertToGeo(0, 0);
    expect(c.convertFromGeo(lng, lat)).toEqual([0, 0]);
    expect(c.search("acme")[0]?.id).toBe("ex_acme");
    c.activateFloor("L2");
    expect(c.snapshot().levelId).toBe("lv_2");
    expect(() => c.activateFloor("L9")).toThrow();
    c.setTheme("dark");
    expect(c.snapshot().theme).toBe("dark");
    expect(c.switchView()).toBe("3d");
    c.selectCurrentPosition(3, 4, false, "L1");
    expect(c.snapshot().position).toEqual({ levelId: "lv_1", x: 3, y: 4 });
    c.reset();
    expect(c.snapshot().view).toBe("2d");
    expect(c.snapshot().position).toEqual({ levelId: "lv_1", x: 3, y: 4 });
    expect(SDK_EVENTS).toContain("stateChanged");
  });
});
