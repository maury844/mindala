import { describe, it, expect } from 'vitest'
import { CURSOR } from '../config'
import { shape, VelocityCursor, type Viewport } from './velocityCursor'

const SIGN_X = CURSOR.INVERT_X ? -1 : 1
const SIGN_Y = CURSOR.INVERT_Y ? -1 : 1

/** A viewport big enough that the cursor never reaches an edge in a test. */
const HUGE: Viewport = { width: 1e7, height: 1e7 }

/**
 * Drive a constant raw angle until the EMA has fully converged to it. With
 * SMOOTH=0.6 each frame closes 40% of the gap, so 200 frames leaves no
 * measurable residual — the cursor is then at steady-state velocity.
 */
function warmToSteadyState(
  cursor: VelocityCursor,
  yaw: number,
  pitch: number,
  dt: number,
  viewport: Viewport,
): void {
  // First frame seeds neutral at (0,0); the rest ramp the angle in.
  cursor.update(0, 0, dt, viewport)
  for (let i = 0; i < 200; i++) cursor.update(yaw, pitch, dt, viewport)
}

describe('shape (expo velocity)', () => {
  it('is ~0 at the edge of the dead zone', () => {
    expect(shape(CURSOR.DEADZONE)).toBeCloseTo(0, 10)
    expect(shape(-CURSOR.DEADZONE)).toBeCloseTo(0, 10)
  })

  it('is ~0 anywhere inside the dead zone', () => {
    expect(shape(0)).toBe(0)
    expect(shape(CURSOR.DEADZONE - 0.5)).toBeCloseTo(0, 10)
  })

  it('reaches SENS at MAX_ANGLE past the dead zone', () => {
    expect(shape(CURSOR.MAX_ANGLE + CURSOR.DEADZONE)).toBeCloseTo(CURSOR.SENS, 6)
  })

  it('saturates at SENS beyond full tilt', () => {
    expect(shape(CURSOR.MAX_ANGLE + CURSOR.DEADZONE + 30)).toBeCloseTo(
      CURSOR.SENS,
      6,
    )
  })

  it('is monotonically increasing between dead zone and full tilt', () => {
    const lo = CURSOR.DEADZONE
    const hi = CURSOR.MAX_ANGLE + CURSOR.DEADZONE
    let prev = -Infinity
    for (let d = lo; d <= hi; d += (hi - lo) / 40) {
      const v = shape(d)
      expect(v).toBeGreaterThan(prev)
      prev = v
    }
  })

  it('is an odd function — sign follows the input', () => {
    for (const d of [4, 8, 15, 22, 40]) {
      expect(shape(-d)).toBeCloseTo(-shape(d), 10)
      expect(shape(d)).toBeGreaterThan(0)
      expect(shape(-d)).toBeLessThan(0)
    }
  })
})

describe('VelocityCursor', () => {
  it('starts centered in the viewport', () => {
    const cursor = new VelocityCursor({ width: 800, height: 600 })
    expect(cursor.position).toEqual({ x: 400, y: 300, speed: 0 })
  })

  it('yields ~zero velocity on the first valid frame (neutral capture)', () => {
    const cursor = new VelocityCursor(HUGE)
    // Even a large tilt on frame one is absorbed: neutral = this frame's pose.
    const s = cursor.update(20, -15, 1 / 60, HUGE)
    expect(s.speed).toBe(0)
    expect(s.x).toBe(HUGE.width / 2)
    expect(s.y).toBe(HUGE.height / 2)
  })

  it('re-zeros neutral on recenter() → ~zero velocity that frame', () => {
    const cursor = new VelocityCursor(HUGE)
    warmToSteadyState(cursor, 18, 12, 1 / 60, HUGE) // moving fast
    expect(cursor.position.speed).toBeGreaterThan(0)

    cursor.recenter()
    const s = cursor.update(18, 12, 1 / 60, HUGE) // same pose now = neutral
    expect(s.speed).toBeCloseTo(0, 10)
  })

  it('integrates ≈ shape(delta) px over 1s at steady state (±2%)', () => {
    const delta = 10 // degrees of yaw past neutral
    const dt = 1 / 60
    const cursor = new VelocityCursor(HUGE)
    warmToSteadyState(cursor, delta, 0, dt, HUGE)

    const start = cursor.position.x
    let elapsed = 0
    while (elapsed < 1) {
      cursor.update(delta, 0, dt, HUGE)
      elapsed += dt
    }
    const dx = cursor.position.x - start

    const expected = shape(delta) * SIGN_X * elapsed
    expect(Math.abs(dx - expected) / Math.abs(expected)).toBeLessThan(0.02)
  })

  it('returns speed = hypot(vx, vy)', () => {
    const dt = 1 / 60
    const cursor = new VelocityCursor(HUGE)
    warmToSteadyState(cursor, 14, 9, dt, HUGE)
    const s = cursor.update(14, 9, dt, HUGE)
    const expected = Math.hypot(shape(14), shape(9))
    expect(s.speed).toBeCloseTo(expected, 6)
  })

  it('respects INVERT_X / INVERT_Y in the velocity sign', () => {
    const dt = 1 / 60
    const cursor = new VelocityCursor(HUGE)
    const center = HUGE.width / 2
    warmToSteadyState(cursor, 12, 12, dt, HUGE) // positive yaw & pitch
    const { x, y } = cursor.position
    // positive delta * SIGN should move the cursor in that direction.
    expect(Math.sign(x - center)).toBe(SIGN_X)
    expect(Math.sign(y - HUGE.height / 2)).toBe(SIGN_Y)
  })

  it('clamps position to the viewport edges', () => {
    const dt = 1 / 60
    const viewport: Viewport = { width: 100, height: 100 }
    const cursor = new VelocityCursor(viewport)
    // Full tilt for plenty of frames drives both axes to their limits.
    cursor.update(0, 0, dt, viewport)
    for (let i = 0; i < 120; i++) cursor.update(40, 40, dt, viewport)
    const { x, y } = cursor.position
    // INVERT_X=true → +yaw drives x to 0; INVERT_Y=false → +pitch drives y to max.
    expect(x).toBe(SIGN_X < 0 ? 0 : viewport.width)
    expect(y).toBe(SIGN_Y < 0 ? 0 : viewport.height)
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x).toBeLessThanOrEqual(viewport.width)
    expect(y).toBeGreaterThanOrEqual(0)
    expect(y).toBeLessThanOrEqual(viewport.height)
  })
})
