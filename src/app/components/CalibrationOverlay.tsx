/**
 * CalibrationOverlay.tsx — the first-run "set your center" step (DESIGN #8).
 *
 * Without this, the loop silently captures whatever pose the user happens to be
 * in on the first tracked frame as neutral/zero, then they steer relative to it
 * — a confusing origin nobody chose. This overlay makes that capture explicit:
 * look at the target, hold a comfortable pose, and that becomes neutral.
 *
 * Pure presentation. The loop in `useEngine` writes the progress ring's
 * conic-gradient straight to `ringRef` each frame (no React re-render); the
 * face-gated line is low-frequency state, so it renders from the `hasFace` prop.
 */

import type { RefObject } from 'react'

interface CalibrationOverlayProps {
  /** True while `phase === 'calibrating'`. */
  visible: boolean
  /** Gates the countdown — the ring only fills while a face is tracked. */
  hasFace: boolean
  /** The loop writes the fill progress (conic-gradient) onto this ring. */
  ringRef: RefObject<HTMLDivElement | null>
}

export default function CalibrationOverlay({
  visible,
  hasFace,
  ringRef,
}: CalibrationOverlayProps) {
  if (!visible) return null

  return (
    <div className="calib" role="dialog" aria-modal="true" aria-label="Calibration">
      <div className="calib-inner">
        <div className="calib-target">
          <div className="calib-ring" ref={ringRef} aria-hidden />
          <div className="calib-bull" aria-hidden />
        </div>

        <h2 className="calib-title">Set your center</h2>
        <p className="calib-copy">
          Get comfortable and look straight at the dot. The pose you hold now
          becomes your <strong>neutral</strong> — the cursor rests here, and you
          steer by turning <em>away</em> from it. Relax back to neutral to stop.
        </p>

        <p className="calib-face" data-face={hasFace ? '1' : '0'} role="status">
          {hasFace
            ? 'Hold still…'
            : 'Position your face in the camera (corner preview) to begin.'}
        </p>

        <p className="calib-skip">
          Press <kbd>Space</kbd> to set it now
        </p>
      </div>
    </div>
  )
}
