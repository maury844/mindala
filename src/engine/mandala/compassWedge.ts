/**
 * compassWedge.ts — an authored 45° sector for a second 8-fold mandala: the
 * "compass / snowflake" reference (sun → ring of pentagons → ring of diamonds →
 * rim balls, laced together by radial spokes inside a frame ring).
 *
 * Same approach as `floralWedge.ts`: not a parametric engine, just one
 * hand-authored wedge that `generateMandala.pure.ts` rotate-copies ×8. Geometry
 * is *computed* from a few named radii + angular widths (not raw coordinates) so
 * the shapes stay precisely symmetric and the tiling guarantee is checkable
 * (`COMPASS_BANDS` + the unit tests).
 *
 * Three fillable motifs, each its own `data-symmetry-group`, stacked in disjoint
 * radial bands on the wedge axis: a pointed `pentagon`, a `diamond` rhombus, and
 * a circular `ball` (authored as a closed two-arc path so it rides the existing
 * `<path>` region pipeline). The center sun is its own group of 1.
 *
 * The spokes and the outer frame ring are the design's signature but are pure
 * linework — too thin to be fillable (MANDALA-SPEC §6) — so they live in the
 * non-fillable decor layer (`decor` is rotate-copied ×8, `staticDecor` once),
 * drawn over the fills like a coloring-book outline.
 *
 * ── Why it tiles without overlap (MANDALA-SPEC §3) ──────────────────────────
 * Each motif sits in a disjoint radial band and stays within ±halfWidth° of the
 * wedge axis (halfWidth ≤ 22.5°). Within a wedge no two motifs share a radius
 * range; across wedges (45° apart) same-band siblings are 45° apart while each
 * spans ≤45° total → they meet at most at a boundary, never overlap. The sun sits
 * inside the innermost band. Decor carries no symmetry group and never fills.
 *
 * Part of `engine/` — imports only `./types`. No DOM, no React.
 */

import type { WedgeMotif, WedgeShape } from './types'

const CX = 500
const CY = 500

/**
 * Polar → Cartesian about the canvas center, angle measured CLOCKWISE from
 * straight up (12 o'clock) to match SVG's y-down `rotate()`. `deg = 0` points up
 * the wedge axis; the wedge spans `deg ∈ [-22.5, +22.5]`. (Identical convention
 * to `floralWedge.ts`.)
 */
function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)]
}

/** Round to 1 dp — keeps `d` / decor strings short and readable. */
function f(v: number): string {
  return (Math.round(v * 10) / 10).toString()
}
function pt(p: [number, number]): string {
  return `${f(p[0])},${f(p[1])}`
}

/**
 * A pentagon ("house") pointing OUTWARD: a sharp apex at `rOut`, two shoulders at
 * `shoulderFrac` up the band reaching ±`half`°, and a flat base at `rIn` spanning
 * ±`baseHalf`°. `baseHalf` is kept wide enough that the base — the narrowest part
 * — still clears the dwell target.
 */
function pentagon(
  rIn: number,
  rOut: number,
  half: number,
  baseHalf: number,
  shoulderFrac: number,
): string {
  const apex = polar(rOut, 0)
  const shoulderR = rIn + (rOut - rIn) * shoulderFrac
  const shR = polar(shoulderR, half)
  const baseR = polar(rIn, baseHalf)
  const baseL = polar(rIn, -baseHalf)
  const shL = polar(shoulderR, -half)
  return `M${pt(apex)} L${pt(shR)} L${pt(baseR)} L${pt(baseL)} L${pt(shL)} Z`
}

/**
 * A rhombus on the wedge axis: inner point at `rIn`, outer point at `rOut`, and
 * two side points at the mid radius reaching ±`half`°.
 */
function diamond(rIn: number, rOut: number, half: number): string {
  const rMid = (rIn + rOut) / 2
  const inner = polar(rIn, 0)
  const right = polar(rMid, half)
  const outer = polar(rOut, 0)
  const left = polar(rMid, -half)
  return `M${pt(inner)} L${pt(right)} L${pt(outer)} L${pt(left)} Z`
}

/**
 * A filled disc centered on the wedge axis at radius `rCenter`, drawn as a closed
 * two-semicircle `<path>` so it rides the same region pipeline as the polygons
 * (the generator only emits `<circle>` for the center). Starts `M`, ends `Z`.
 */
function disc(rCenter: number, radius: number): string {
  const [cx, cy] = polar(rCenter, 0)
  const left = `${f(cx - radius)},${f(cy)}`
  const right = `${f(cx + radius)},${f(cy)}`
  const r = f(radius)
  return `M${left} A${r},${r} 0 1 0 ${right} A${r},${r} 0 1 0 ${left} Z`
}

/** A radial spoke (decor `<line>`) along the wedge axis from `rA` to `rB`. */
function spoke(rA: number, rB: number, width: number): string {
  const a = polar(rA, 0)
  const b = polar(rB, 0)
  return `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke-width="${width}"/>`
}

/** A concentric decor `<circle>` (the frame ring), centered on the canvas. */
function ring(r: number, width: number): string {
  return `<circle cx="${CX}" cy="${CY}" r="${r}" stroke-width="${width}"/>`
}

/**
 * Radial layout of the three fillable motif bands (inner → outer). Disjoint
 * `[rInner, rOuter]` ranges and `halfWidthDeg ≤ 22.5` are what guarantee the
 * no-overlap tiling; the unit tests assert exactly that. `halfWidthDeg` is the
 * widest angular reach the band's motif uses.
 */
export interface CompassBand {
  group: string
  rInner: number
  rOuter: number
  halfWidthDeg: number
}

/** Radius of the center sun; sits inside the innermost band. */
export const COMPASS_CENTER_RADIUS = 85

/** The rim ball: center radius + radius (must lie inside the `ball` band). */
export const COMPASS_BALL = { center: 410, radius: 42 } as const

/** Radius of the outer frame ring (decor). */
export const COMPASS_RING_RADIUS = 470

export const COMPASS_BANDS: readonly CompassBand[] = [
  { group: 'pentagon', rInner: 110, rOuter: 205, halfWidthDeg: 21 },
  { group: 'diamond', rInner: 220, rOuter: 345, halfWidthDeg: 15 },
  { group: 'ball', rInner: 368, rOuter: 452, halfWidthDeg: 7 },
] as const

/**
 * The authored 8-fold compass wedge: one fillable shape per band (each its own
 * symmetry group) + the center sun, plus a rotate-copied spoke and the single
 * static frame ring. Consumed by `generate(compassMotif, 8)`.
 */
export const compassMotif: WedgeMotif = {
  shapes: [
    { id: 'pentagon', groupId: 'pentagon', d: pentagon(110, 205, 21, 19, 0.5) },
    { id: 'diamond', groupId: 'diamond', d: diamond(220, 345, 15) },
    {
      id: 'ball',
      groupId: 'ball',
      d: disc(COMPASS_BALL.center, COMPASS_BALL.radius),
    },
  ] satisfies WedgeShape[],
  center: {
    groupId: 'center',
    circle: { cx: CX, cy: CY, r: COMPASS_CENTER_RADIUS },
  },
  // Spoke runs from the sun's edge to where the ball begins; rotate-copied ×8.
  decor: [spoke(COMPASS_CENTER_RADIUS + 10, COMPASS_BALL.center - COMPASS_BALL.radius + 4, 4.5)],
  staticDecor: [ring(COMPASS_RING_RADIUS, 7)],
}
