/**
 * CalibrationOverlay.tsx — the first-run "set your center" step (DESIGN #8).
 *
 * Without this, the loop silently captures whatever pose the user happens to be
 * in on the first tracked frame as neutral/zero, then they steer relative to it
 * — a confusing origin nobody chose. This overlay makes that capture explicit:
 * look straight at the camera and hold still; once your head settles it counts
 * down three seconds and locks that resting pose as neutral.
 *
 * Pure presentation. The loop in `useEngine` writes the per-frame bits straight
 * to refs (no React re-render): the countdown ring's conic-gradient (`ringRef`),
 * the center 3/2/1 number (`countRef`), and the status line text/state
 * (`statusRef`). The static copy below never changes.
 */

import type { RefObject } from 'react'

interface CalibrationOverlayProps {
  /** True while `phase === 'calibrating'`. */
  visible: boolean
  /** The loop writes the countdown fill (conic-gradient) onto this ring. */
  ringRef: RefObject<HTMLDivElement | null>
  /** The loop writes the center countdown number (3 → 2 → 1) here. */
  countRef: RefObject<HTMLDivElement | null>
  /** The loop writes the face/settle/count status copy + `data-state` here. */
  statusRef: RefObject<HTMLParagraphElement | null>
}

export default function CalibrationOverlay({
  visible,
  ringRef,
  countRef,
  statusRef,
}: CalibrationOverlayProps) {
  if (!visible) return null

  return (
    <div className="calib" role="dialog" aria-modal="true" aria-label="Calibration">
      <div className="calib-inner">
        <div className="calib-target">
          <div className="calib-ring" ref={ringRef} aria-hidden />
          <div className="calib-count" ref={countRef} aria-hidden />
          <div className="calib-bull" aria-hidden />
        </div>

        <h2 className="calib-title">Set your center</h2>
        <p className="calib-copy">
          Look straight at the camera and hold still. When your head settles we
          count down and capture this as your <strong>neutral</strong> — the
          cursor rests here, and you steer by turning <em>away</em> from it.
        </p>

        <p
          className="calib-status-line"
          ref={statusRef}
          data-state="settling"
          role="status"
        >
          Look straight at the camera and hold still…
        </p>

        <p className="calib-skip">
          Press <kbd>Space</kbd> to capture now
        </p>
      </div>
    </div>
  )
}
