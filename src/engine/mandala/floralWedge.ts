/**
 * floralWedge.ts — THE authored asset: one 45° floral sector for an 8-fold
 * mandala (DESIGN decision #11 / DISCOVERY §8).
 *
 * This is the "generator" for Phase A: not a parametric engine, just one
 * hand-authored wedge that `generateMandala.pure.ts` rotate-copies ×8. The motif
 * reads, inner→outer, as: center disc → lotus petals → ring of hearts → pointed
 * petals → outer crown. Each motif is its own `data-symmetry-group`.
 *
 * Geometry is *computed* from a few named parameters (radii + angular widths)
 * rather than typed as raw bézier coordinates — that keeps the shapes precisely
 * symmetric and makes the tiling guarantee checkable (see `FLORAL_BANDS` and the
 * unit tests). Output is still one fixed wedge, not a runtime generator.
 *
 * ── Why it tiles without overlap (MANDALA-SPEC §3) ──────────────────────────
 * Every motif lives in a disjoint radial *band* and stays within ±halfWidth° of
 * its wedge axis (halfWidth ≤ 22.5°). So within a wedge no two motifs share a
 * radius range, and across wedges (rotated 45° apart) same-band siblings are 45°
 * apart while each spans ≤45° total → they meet at most at a boundary, never
 * overlap. The center disc sits inside the innermost band.
 *
 * Part of `engine/` — imports only `./types`. No DOM, no React.
 */

import type { WedgeMotif, WedgeShape } from './types'

const CX = 500
const CY = 500

/**
 * Polar → Cartesian about the canvas center, with the angle measured CLOCKWISE
 * from straight up (12 o'clock) to match SVG's y-down `rotate()`. So `deg = 0`
 * points up the wedge axis; the wedge spans `deg ∈ [-22.5, +22.5]`.
 */
function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)]
}

/** Round to 1 dp and join — keeps `d` strings short and readable. */
function f(v: number): string {
  return (Math.round(v * 10) / 10).toString()
}
function pt(p: [number, number]): string {
  return `${f(p[0])},${f(p[1])}`
}

/**
 * A symmetric leaf/almond: pointed at the inner radius and the outer radius,
 * bulging to ±`half`° around its midpoint. Used for slender pointed petals.
 */
function leaf(rIn: number, rOut: number, half: number): string {
  const span = rOut - rIn
  const base = polar(rIn, 0)
  const tip = polar(rOut, 0)
  const cR1 = polar(rIn + span * 0.3, half)
  const cR2 = polar(rOut - span * 0.3, half)
  const cL2 = polar(rOut - span * 0.3, -half)
  const cL1 = polar(rIn + span * 0.3, -half)
  return `M${pt(base)} C${pt(cR1)} ${pt(cR2)} ${pt(tip)} C${pt(cL2)} ${pt(cL1)} ${pt(base)} Z`
}

/**
 * A petal with a ROUNDED base (two base points joined by a shallow inward dip)
 * and a pointed outer tip — a classic flower / crown petal that nestles against
 * the ring inside it. Bulges to ±`half`°; base spans ±`baseHalf`°.
 */
function crownPetal(
  rIn: number,
  rOut: number,
  half: number,
  baseHalf: number,
): string {
  const span = rOut - rIn
  const tip = polar(rOut, 0)
  const baseR = polar(rIn, baseHalf)
  const baseL = polar(rIn, -baseHalf)
  const baseDip = polar(rIn - 7, 0)
  const cR1 = polar(rIn + span * 0.3, half)
  const cR2 = polar(rOut - span * 0.28, half)
  const cL2 = polar(rOut - span * 0.28, -half)
  const cL1 = polar(rIn + span * 0.3, -half)
  return (
    `M${pt(baseR)} C${pt(cR1)} ${pt(cR2)} ${pt(tip)}` +
    ` C${pt(cL2)} ${pt(cL1)} ${pt(baseL)} Q${pt(baseDip)} ${pt(baseR)} Z`
  )
}

/**
 * A petal rounded at BOTH ends (shallow inward dip at the base, a domed cap at
 * the tip) and bulging to ±`half`°. Fuller than {@link crownPetal} — it holds a
 * noticeably larger inscribed circle, which the small inner-flower petals need to
 * clear the 40px dwell target. `baseHalf` / `tipHalf` set the rounded ends.
 */
function roundPetal(
  rIn: number,
  rOut: number,
  half: number,
  baseHalf: number,
  tipHalf: number,
): string {
  const span = rOut - rIn
  const baseR = polar(rIn, baseHalf)
  const baseL = polar(rIn, -baseHalf)
  const tipR = polar(rOut, tipHalf)
  const tipL = polar(rOut, -tipHalf)
  const baseDip = polar(rIn - 7, 0)
  const tipCap = polar(rOut + 4, 0)
  const cR1 = polar(rIn + span * 0.28, half)
  const cR2 = polar(rOut - span * 0.24, half)
  const cL2 = polar(rOut - span * 0.24, -half)
  const cL1 = polar(rIn + span * 0.28, -half)
  return (
    `M${pt(baseR)} C${pt(cR1)} ${pt(cR2)} ${pt(tipR)}` +
    ` Q${pt(tipCap)} ${pt(tipL)}` +
    ` C${pt(cL2)} ${pt(cL1)} ${pt(baseL)}` +
    ` Q${pt(baseDip)} ${pt(baseR)} Z`
  )
}

/**
 * A heart whose cusp points inward (toward the center) and whose two lobes bulge
 * outward — a "ring of hearts" radiating from the middle. `lobe`° = half-angle
 * of the two lobe tops at `rOut`; `side`° = half-angle of the widest point at
 * mid-radius (`side` > `lobe`). The central cleft dips inside `rOut`.
 */
function heart(rIn: number, rOut: number, lobe: number, side: number): string {
  const span = rOut - rIn
  const rMid = rIn + span * 0.52
  const rCleft = rOut - span * 0.2

  const cusp = polar(rIn, 0)
  const rightSide = polar(rMid, side)
  const rightTop = polar(rOut, lobe)
  const cleft = polar(rCleft, 0)
  const leftTop = polar(rOut, -lobe)
  const leftSide = polar(rMid, -side)

  // Right half control points (cusp → side → lobe top → cleft).
  const s1a = polar(rIn + (rMid - rIn) * 0.3, side * 0.45)
  const s1b = polar(rMid, side * 0.85)
  const s2a = polar(rMid + (rOut - rMid) * 0.5, side)
  const s2b = polar(rOut + 3, side * 0.7)
  const s3a = polar(rOut - 2, lobe * 0.45)
  const s3b = polar(rCleft + (rOut - rCleft) * 0.5, lobe * 0.25)

  // Left half = mirror of the right (negate every control angle, reverse order).
  const m1a = polar(rIn + (rMid - rIn) * 0.3, -side * 0.45)
  const m1b = polar(rMid, -side * 0.85)
  const m2a = polar(rMid + (rOut - rMid) * 0.5, -side)
  const m2b = polar(rOut + 3, -side * 0.7)
  const m3a = polar(rOut - 2, -lobe * 0.45)
  const m3b = polar(rCleft + (rOut - rCleft) * 0.5, -lobe * 0.25)

  return (
    `M${pt(cusp)}` +
    ` C${pt(s1a)} ${pt(s1b)} ${pt(rightSide)}` +
    ` C${pt(s2a)} ${pt(s2b)} ${pt(rightTop)}` +
    ` C${pt(s3a)} ${pt(s3b)} ${pt(cleft)}` +
    ` C${pt(m3b)} ${pt(m3a)} ${pt(leftTop)}` +
    ` C${pt(m2b)} ${pt(m2a)} ${pt(leftSide)}` +
    ` C${pt(m1b)} ${pt(m1a)} ${pt(cusp)} Z`
  )
}

/**
 * Radial layout of the four fillable motif bands (inner → outer). Disjoint
 * `[rInner, rOuter]` ranges and `halfWidthDeg ≤ 22.5` are what guarantee the
 * no-overlap tiling; the unit tests assert exactly that. `halfWidthDeg` is the
 * widest angular reach the band's motif uses.
 */
export interface FloralBand {
  group: string
  rInner: number
  rOuter: number
  halfWidthDeg: number
}

/** Radius of the center disc; sits inside the innermost band. */
export const FLORAL_CENTER_RADIUS = 72

export const FLORAL_BANDS: readonly FloralBand[] = [
  { group: 'petal', rInner: 80, rOuter: 190, halfWidthDeg: 20 },
  { group: 'heart', rInner: 198, rOuter: 306, halfWidthDeg: 18 },
  { group: 'point', rInner: 314, rOuter: 406, halfWidthDeg: 9 },
  { group: 'scroll', rInner: 414, rOuter: 492, halfWidthDeg: 19 },
] as const

/**
 * The authored 8-fold floral wedge: one shape per band (each its own symmetry
 * group) plus the center disc. Consumed by `generate(floralMotif, 8)`.
 */
export const floralMotif: WedgeMotif = {
  shapes: [
    { id: 'petal', groupId: 'petal', d: roundPetal(80, 190, 20, 9, 10) },
    { id: 'heart', groupId: 'heart', d: heart(198, 306, 9, 18) },
    { id: 'point', groupId: 'point', d: leaf(314, 406, 9) },
    { id: 'scroll', groupId: 'scroll', d: crownPetal(414, 492, 19, 10) },
  ] satisfies WedgeShape[],
  center: {
    groupId: 'center',
    circle: { cx: CX, cy: CY, r: FLORAL_CENTER_RADIUS },
  },
}
