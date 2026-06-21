import { describe, it, expect } from 'vitest'
import {
  COMPASS_BANDS,
  COMPASS_BALL,
  COMPASS_CENTER_RADIUS,
  COMPASS_RING_RADIUS,
  compassMotif,
} from './compassWedge'

/** AC: the smallest fillable region must enclose a 40px circle at 600px render. */
const RENDER_SCALE = 600 / 1000
const MIN_REGION_VB = 40 / RENDER_SCALE // ≈ 66.7 viewBox units

describe('compass wedge asset', () => {
  it('has three distinct motif groups plus a center sun', () => {
    expect(compassMotif.shapes).toHaveLength(3)
    expect(new Set(compassMotif.shapes.map((s) => s.groupId)).size).toBe(3)
    expect(compassMotif.center?.circle).toBeDefined()
  })

  it('authors every motif as a closed, non-empty path (M…Z)', () => {
    for (const s of compassMotif.shapes) {
      expect(s.d.length).toBeGreaterThan(0)
      expect(s.d.startsWith('M')).toBe(true)
      expect(s.d.trimEnd().endsWith('Z')).toBe(true)
    }
  })

  it('aligns one shape per band, in inner→outer order', () => {
    expect(compassMotif.shapes.map((s) => s.groupId)).toEqual(
      COMPASS_BANDS.map((b) => b.group),
    )
  })

  // ── The tiling guarantee (MANDALA-SPEC §3), proven structurally. ──
  it('keeps bands radially disjoint → no two motifs overlap within a wedge', () => {
    for (let i = 1; i < COMPASS_BANDS.length; i++) {
      expect(COMPASS_BANDS[i].rInner).toBeGreaterThan(COMPASS_BANDS[i - 1].rOuter)
    }
  })

  it('keeps every motif within ±22.5° → no overlap across the 8 wedges', () => {
    for (const b of COMPASS_BANDS) {
      expect(b.halfWidthDeg).toBeLessThanOrEqual(22.5)
    }
  })

  it('seats the sun inside the innermost band and the ball inside its band', () => {
    expect(COMPASS_CENTER_RADIUS).toBeLessThanOrEqual(COMPASS_BANDS[0].rInner)
    const ballBand = COMPASS_BANDS.find((b) => b.group === 'ball')!
    expect(COMPASS_BALL.center - COMPASS_BALL.radius).toBeGreaterThanOrEqual(
      ballBand.rInner,
    )
    expect(COMPASS_BALL.center + COMPASS_BALL.radius).toBeLessThanOrEqual(
      ballBand.rOuter,
    )
  })

  it('makes every region thick enough for the 40px dwell target at 600px', () => {
    // Radial thickness upper-bounds the inscribed circle; require it ≥ target.
    for (const b of COMPASS_BANDS) {
      expect(b.rOuter - b.rInner).toBeGreaterThanOrEqual(MIN_REGION_VB)
    }
    expect(2 * COMPASS_CENTER_RADIUS).toBeGreaterThanOrEqual(MIN_REGION_VB)
    expect(2 * COMPASS_BALL.radius).toBeGreaterThanOrEqual(MIN_REGION_VB)
  })

  it('declares spokes (rotate-copied) and a frame ring (static) as decor', () => {
    expect(compassMotif.decor?.length).toBe(1)
    expect(compassMotif.decor?.[0]).toContain('<line')
    expect(compassMotif.staticDecor?.[0]).toContain('<circle')
    // The frame ring sits outside every fillable band.
    expect(COMPASS_RING_RADIUS).toBeGreaterThan(
      COMPASS_BANDS[COMPASS_BANDS.length - 1].rOuter,
    )
  })
})
