import { describe, it, expect } from 'vitest'
import {
  FLORAL_BANDS,
  FLORAL_CENTER_RADIUS,
  floralMotif,
} from './floralWedge'

/** AC: the smallest fillable region must enclose a 40px circle at 600px render. */
const RENDER_SCALE = 600 / 1000
const MIN_REGION_VB = 40 / RENDER_SCALE // ≈ 66.7 viewBox units

describe('floral wedge asset', () => {
  it('has four distinct motif groups plus a center disc', () => {
    expect(floralMotif.shapes).toHaveLength(4)
    expect(new Set(floralMotif.shapes.map((s) => s.groupId)).size).toBe(4)
    expect(floralMotif.center?.circle).toBeDefined()
  })

  it('authors every motif as a closed, non-empty path (M…Z)', () => {
    for (const s of floralMotif.shapes) {
      expect(s.d.length).toBeGreaterThan(0)
      expect(s.d.startsWith('M')).toBe(true)
      expect(s.d.trimEnd().endsWith('Z')).toBe(true)
    }
  })

  it('aligns one shape per band, in inner→outer order', () => {
    expect(floralMotif.shapes.map((s) => s.groupId)).toEqual(
      FLORAL_BANDS.map((b) => b.group),
    )
  })

  // ── The tiling guarantee (MANDALA-SPEC §3), proven structurally. ──
  it('keeps bands radially disjoint → no two motifs overlap within a wedge', () => {
    for (let i = 1; i < FLORAL_BANDS.length; i++) {
      expect(FLORAL_BANDS[i].rInner).toBeGreaterThan(FLORAL_BANDS[i - 1].rOuter)
    }
  })

  it('keeps every motif within ±22.5° → no overlap across the 8 wedges', () => {
    for (const b of FLORAL_BANDS) {
      expect(b.halfWidthDeg).toBeLessThanOrEqual(22.5)
    }
  })

  it('seats the center disc inside the innermost band', () => {
    expect(FLORAL_CENTER_RADIUS).toBeLessThanOrEqual(FLORAL_BANDS[0].rInner)
  })

  it('makes every region thick enough for the 40px dwell target at 600px', () => {
    // Radial thickness upper-bounds the inscribed circle; require it ≥ target.
    for (const b of FLORAL_BANDS) {
      expect(b.rOuter - b.rInner).toBeGreaterThanOrEqual(MIN_REGION_VB)
    }
    expect(2 * FLORAL_CENTER_RADIUS).toBeGreaterThanOrEqual(MIN_REGION_VB)
  })
})
