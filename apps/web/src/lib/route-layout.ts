/** Where the Journey route's stops sit in its SVG box. Pure and deterministic. */

export type Point = { x: number; y: number };

/** Space kept free at the top and bottom of the box (less when the box is short). */
const MARGIN_Y = 40;
/** How far stops swing either side of the centre line, as a share of the width. */
const SWING = 0.11;

const finiteOr = (v: number, fallback: number) => (Number.isFinite(v) && v > 0 ? v : fallback);

/**
 * `n` stops inside a `width` x `height` box: top to bottom at even steps, and
 * swinging left and right of the centre (first stop on the left), so a smooth
 * curve through them is a gentle S that keeps to a band in the middle and
 * leaves both sides free for labels. One stop sits in the centre; zero (or a
 * non-integer or negative count) gives no points. Never NaN: a bad box size
 * counts as 1.
 */
export function routeLayout(n: number, width: number, height: number): Point[] {
  const count = Number.isInteger(n) && n > 0 ? n : 0;
  const w = finiteOr(width, 1);
  const h = finiteOr(height, 1);
  const cx = w / 2;
  if (count === 0) return [];
  if (count === 1) return [{ x: cx, y: h / 2 }];
  const my = Math.min(MARGIN_Y, h / 4);
  const step = (h - 2 * my) / (count - 1);
  const swing = w * SWING;
  return Array.from({ length: count }, (_, i) => ({ x: cx + (i % 2 === 0 ? -swing : swing), y: my + i * step }));
}
