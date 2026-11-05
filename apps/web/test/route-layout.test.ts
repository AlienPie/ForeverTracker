import { describe, expect, test } from "vitest";
import { routeLayout } from "../src/lib/route-layout";

const W = 400;
const H = 300;

function inside(points: { x: number; y: number }[], w: number, h: number) {
  for (const p of points) {
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(w);
    expect(p.y).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(h);
  }
}

describe("routeLayout", () => {
  test("no stops: no points", () => {
    expect(routeLayout(0, W, H)).toEqual([]);
  });

  test("one stop: a single finite point in the middle", () => {
    const pts = routeLayout(1, W, H);
    expect(pts).toHaveLength(1);
    inside(pts, W, H);
    expect(pts[0]).toEqual({ x: W / 2, y: H / 2 });
  });

  test("two stops: top to bottom, on either side of the centre", () => {
    const pts = routeLayout(2, W, H);
    expect(pts).toHaveLength(2);
    inside(pts, W, H);
    expect(pts[1]!.y).toBeGreaterThan(pts[0]!.y);
    expect(pts[0]!.x).toBeLessThan(W / 2);
    expect(pts[1]!.x).toBeGreaterThan(W / 2);
  });

  test("eight stops: inside the box with margins, ordered top to bottom, swinging side to side", () => {
    const pts = routeLayout(8, W, H);
    expect(pts).toHaveLength(8);
    inside(pts, W, H);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.y).toBeGreaterThan(pts[i - 1]!.y);
      // Alternate sides: a gentle S through the stops.
      expect(Math.sign(pts[i]!.x - W / 2)).toBe(-Math.sign(pts[i - 1]!.x - W / 2));
    }
    // Margins: nothing hugs an edge.
    expect(Math.min(...pts.map((p) => p.y))).toBeGreaterThanOrEqual(20);
    expect(Math.max(...pts.map((p) => p.y))).toBeLessThanOrEqual(H - 20);
  });

  test("deterministic", () => {
    expect(routeLayout(8, W, H)).toEqual(routeLayout(8, W, H));
  });

  test("odd inputs never give NaN", () => {
    for (const [n, w, h] of [
      [-1, W, H],
      [Number.NaN, W, H],
      [2.5, W, H],
      [3, 0, 0],
      [3, Number.NaN, H],
    ] as const) {
      for (const p of routeLayout(n, w, h)) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      }
    }
    expect(routeLayout(-1, W, H)).toEqual([]);
  });
});
