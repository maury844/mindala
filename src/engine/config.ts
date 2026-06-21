/**
 * config.ts — the single source of truth for all "feel" magic numbers.
 *
 * Every value here is VALIDATED on real hardware via the throwaway spikes
 * (`spike/index.html`, `spike/dwell.html`) and mirrors DISCOVERY.md §4.
 * No other file may redefine these. If a number needs tuning, tune it HERE.
 *
 * This file is part of `engine/` — it imports nothing from React (hard rule).
 */

/**
 * Cursor pipeline.
 * Flow: pose → (angle − neutral) → dead zone → expo → velocity → integrate.
 */
export const CURSOR = {
  /** px/s — top cursor speed at full tilt. */
  SENS: 1200,
  /** degrees — head angle within this maps to zero velocity. */
  DEADZONE: 3,
  /** response-curve exponent (small tilt = fine control, big tilt = fast). */
  EXPO: 1.7,
  /** EMA factor; applied as `sm += (raw − sm) * (1 − SMOOTH)`. */
  SMOOTH: 0.6,
  /** degrees — angle that maps to full speed. */
  MAX_ANGLE: 22,
  /** turn right → cursor right. */
  INVERT_X: true,
  /** nod down → cursor down. */
  INVERT_Y: false,
} as const

/**
 * Dwell loop (region park-to-paint).
 */
export const DWELL = {
  /** seconds — park duration to complete a fill. */
  DWELL_TIME: 1.2,
  /** px/s — only accumulate dwell while cursor speed < this (≈ head near neutral). */
  MUST_STOP: 60,
  /** on leaving a region, progress drains (decay) rather than snapping to zero. */
  RESET_MODE: 'decay',
  /** per second — drain rate for decay reset. */
  DECAY: 1.8,
  /**
   * mouth-open clutch threshold (+ a brief hold). RESERVED feature — not used
   * in the Phase-A build (talking alone hits ~0.4, so threshold ≥ 0.5).
   */
  JAW_THRESH: 0.5,
} as const

/**
 * Onboarding / calibration (Phase B2 — first-run wrapper around `recenter()`).
 *
 * Like RUNTIME below, this is NOT a spike-validated feel constant — it is the
 * dwell time of the first-run "set your center" overlay (DESIGN decision #8) and
 * is safe to tune. The overlay simply re-zeros neutral after the user holds a
 * comfortable pose for HOLD_SEC, so they know their resting pose is the origin.
 */
export const CALIBRATE = {
  /** seconds the user holds a neutral pose while the overlay captures it. */
  HOLD_SEC: 2.2,
} as const

/**
 * Runtime resilience thresholds (Phase B1 — robustness).
 *
 * Unlike CURSOR/DWELL, these are NOT spike-validated feel constants — they are
 * defaults for the weak-hardware warning and are safe to tune. Hysteresis (trip
 * vs. clear) keeps the warning from flickering on transient dips, and the trip
 * window is long enough to skip the fps EMA's warm-up after the model loads.
 */
export const RUNTIME = {
  /** fps below this (sustained) is considered degraded performance. */
  LOW_FPS: 15,
  /** seconds fps must stay below LOW_FPS before the warning trips. */
  PERF_TRIP_SEC: 4,
  /** seconds fps must recover above LOW_FPS before the warning clears. */
  PERF_CLEAR_SEC: 3,
} as const
