/**
 * perfMonitor.pure.ts — sustained low-frame-rate detector (Phase B1 robustness).
 *
 * On weak hardware the rAF loop can crater below a usable rate. Rather than read
 * one noisy frame, this accumulates how long fps has stayed below a threshold and
 * only reports `degraded` once it has been low for `tripSeconds` — long enough to
 * skip the fps EMA's warm-up after the model loads. Hysteresis (a separate
 * `clearSeconds` recovery window) stops the warning from flickering on the
 * boundary.
 *
 * Pure — no DOM/React/timers; the caller feeds it `(fps, dt)` each frame. Part of
 * `engine/`, `*.pure.ts`.
 */

import { RUNTIME } from '../config'

export interface PerfMonitorOptions {
  /** fps below this counts as "low". */
  lowFps?: number
  /** seconds below `lowFps` before `degraded` trips. */
  tripSeconds?: number
  /** seconds at/above `lowFps` before `degraded` clears. */
  clearSeconds?: number
}

export class PerfMonitor {
  private readonly lowFps: number
  private readonly tripSeconds: number
  private readonly clearSeconds: number

  /** Seconds spent continuously below / at-or-above `lowFps`. */
  private belowAcc = 0
  private aboveAcc = 0
  private _degraded = false

  constructor(opts: PerfMonitorOptions = {}) {
    this.lowFps = opts.lowFps ?? RUNTIME.LOW_FPS
    this.tripSeconds = opts.tripSeconds ?? RUNTIME.PERF_TRIP_SEC
    this.clearSeconds = opts.clearSeconds ?? RUNTIME.PERF_CLEAR_SEC
  }

  /** Whether performance is currently considered degraded. */
  get degraded(): boolean {
    return this._degraded
  }

  /**
   * Feed one frame's smoothed fps and elapsed seconds. Returns the (possibly
   * updated) `degraded` flag. Non-positive `dt` is ignored so a paused tab can't
   * skew the accumulators.
   */
  sample(fps: number, dt: number): boolean {
    if (dt <= 0 || !Number.isFinite(fps)) return this._degraded

    if (fps < this.lowFps) {
      this.belowAcc += dt
      this.aboveAcc = 0
      if (!this._degraded && this.belowAcc >= this.tripSeconds) {
        this._degraded = true
      }
    } else {
      this.aboveAcc += dt
      this.belowAcc = 0
      if (this._degraded && this.aboveAcc >= this.clearSeconds) {
        this._degraded = false
      }
    }
    return this._degraded
  }

  /** Clear all state (e.g. on a fresh session / retry). */
  reset(): void {
    this.belowAcc = 0
    this.aboveAcc = 0
    this._degraded = false
  }
}
