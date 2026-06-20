/**
 * velocityCursor.ts — head pose → screen cursor, with the validated feel.
 *
 * Implements the spike's pipeline (`spike/index.html`) as a framework-free,
 * DOM-free integrator:
 *
 *   raw angle → EMA smoothing → (angle − neutral) → dead zone → expo → velocity
 *             → integrate (× dt) → position clamped to the viewport
 *
 * Turn/nod your head to set a velocity; relax to neutral and the cursor stops.
 * Every "feel" magic number comes from `config.ts` (DISCOVERY §4) — none are
 * inlined here.
 *
 * Part of `engine/` — imports nothing from React or the DOM (the caller owns the
 * rAF loop, the `<video>`, and `window`). The only dependency is `config.ts`.
 */

import { CURSOR } from '../config'

/** Render surface the cursor is integrated within, in CSS pixels. */
export interface Viewport {
  width: number
  height: number
}

/** Cursor position (px, top-left origin) plus its instantaneous speed (px/s). */
export interface CursorState {
  x: number
  y: number
  /** `hypot(vx, vy)` — the dwell controller's "must-stop" gate reads this. */
  speed: number
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Expo-shaped velocity from an angle delta (degrees, measured past neutral).
 *
 * Pure and exported for tests. The dead zone is removed first, the remainder is
 * normalized against `MAX_ANGLE` and raised to `EXPO` (small tilt = fine, big
 * tilt = fast), then scaled to `SENS`. The result keeps the sign of `delta`;
 * axis inversion (`INVERT_X/Y`) is applied by the cursor, not here.
 *
 * @returns signed velocity in px/s, in `[-SENS, SENS]`.
 */
export function shape(delta: number): number {
  const sign = Math.sign(delta)
  const mag = Math.max(0, Math.abs(delta) - CURSOR.DEADZONE)
  const norm = Math.min(mag / CURSOR.MAX_ANGLE, 1)
  return sign * Math.pow(norm, CURSOR.EXPO) * CURSOR.SENS
}

/**
 * Stateful head-pose → cursor integrator. One instance per session.
 *
 * Usage (driven by the shell's rAF loop, M5):
 *   const cursor = new VelocityCursor({ width, height })
 *   // each frame WHILE A FACE IS PRESENT (freeze by skipping update on face-loss):
 *   const { x, y, speed } = cursor.update(sample.yaw, sample.pitch, dt, viewport)
 *   // re-zero neutral to wherever the head currently rests:
 *   cursor.recenter()
 *
 * The caller is responsible for clamping `dt` (e.g. tab-switch spikes) — this
 * class is a pure integrator and trusts the `dt` it is given.
 */
export class VelocityCursor {
  /** EMA-smoothed angles (deg). Seeded on the first frame to avoid a ramp-in. */
  private smYaw = 0
  private smPitch = 0
  private haveAngles = false

  /** Neutral reference captured on the first frame and on each `recenter()`. */
  private neutralYaw = 0
  private neutralPitch = 0
  private recenterPending = true

  private x: number
  private y: number
  private speed = 0

  constructor(viewport: Viewport) {
    this.x = viewport.width / 2
    this.y = viewport.height / 2
  }

  /** Last computed state, without advancing the integrator. */
  get position(): CursorState {
    return { x: this.x, y: this.y, speed: this.speed }
  }

  /**
   * Re-zero the neutral pose to wherever the head currently rests. Takes effect
   * on the next `update()`, which yields ~zero velocity for that frame.
   */
  recenter(): void {
    this.recenterPending = true
  }

  /**
   * Advance one frame: smooth the raw angles, compute velocity past the dead
   * zone, integrate by `dt`, and clamp to the viewport.
   *
   * @param rawYaw   head yaw in degrees (turn) — typically `FaceSample.yaw`.
   * @param rawPitch head pitch in degrees (nod) — typically `FaceSample.pitch`.
   * @param dt       elapsed seconds since the previous frame.
   * @param viewport current render surface (re-read each frame for resizes).
   */
  update(
    rawYaw: number,
    rawPitch: number,
    dt: number,
    viewport: Viewport,
  ): CursorState {
    // EMA smoothing. Seed on the first frame so the cursor doesn't ramp in from
    // a stale zero; afterward: sm += (raw − sm) * (1 − SMOOTH).
    if (!this.haveAngles) {
      this.smYaw = rawYaw
      this.smPitch = rawPitch
      this.haveAngles = true
    } else {
      this.smYaw += (rawYaw - this.smYaw) * (1 - CURSOR.SMOOTH)
      this.smPitch += (rawPitch - this.smPitch) * (1 - CURSOR.SMOOTH)
    }

    // Capture neutral from the (already-smoothed) angle so this frame's delta is
    // zero → no velocity on the first frame or right after a recenter.
    if (this.recenterPending) {
      this.neutralYaw = this.smYaw
      this.neutralPitch = this.smPitch
      this.recenterPending = false
    }

    const dYaw = this.smYaw - this.neutralYaw
    const dPitch = this.smPitch - this.neutralPitch

    const vx = shape(dYaw) * (CURSOR.INVERT_X ? -1 : 1)
    const vy = shape(dPitch) * (CURSOR.INVERT_Y ? -1 : 1)

    this.x = clamp(this.x + vx * dt, 0, viewport.width)
    this.y = clamp(this.y + vy * dt, 0, viewport.height)
    this.speed = Math.hypot(vx, vy)

    return this.position
  }
}
