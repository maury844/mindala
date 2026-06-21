/**
 * CameraGate.tsx — the front door. A full-screen overlay shown until the loop is
 * running (`phase !== 'ready'`). It is user-triggered: the camera prompt only
 * fires on the Start click, which keeps getUserMedia inside a user gesture and
 * sidesteps StrictMode double-mount races.
 *
 * States: idle (Start) · requesting/loading (progress) · denied/error (retry).
 * Pure presentation — all lifecycle lives in `useEngine`.
 */

import type { EnginePhase } from '../hooks/useEngine'

interface CameraGateProps {
  phase: EnginePhase
  errorMessage: string | null
  onStart: () => void
}

export default function CameraGate({
  phase,
  errorMessage,
  onStart,
}: CameraGateProps) {
  const busy = phase === 'requesting' || phase === 'loading'
  const failed = phase === 'denied' || phase === 'error'

  return (
    <div className="gate" role="dialog" aria-modal="true">
      <div className="gate-card">
        <h1 className="gate-title">Head-controlled mandala coloring</h1>
        <p className="gate-sub">
          Steer the cursor by turning and nodding your head. Relax to neutral over
          a petal to fill it — it mirrors across all eight wedges.
        </p>

        {busy && (
          <p className="gate-status">
            <span className="spinner" aria-hidden />
            {phase === 'requesting'
              ? 'Waiting for camera permission…'
              : 'Loading the face-tracking model (~3 MB, first time only)…'}
          </p>
        )}

        {failed && errorMessage && (
          <p className="gate-error" role="alert">
            {errorMessage}
          </p>
        )}

        {!busy && (
          <button type="button" className="gate-button" onClick={onStart}>
            {failed ? 'Try again' : 'Enable camera & start'}
          </button>
        )}

        <p className="gate-fineprint">
          Your camera feed stays on your device — tracking runs entirely in the
          browser.
        </p>
      </div>
    </div>
  )
}
