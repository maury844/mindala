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
