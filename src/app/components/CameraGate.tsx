/**
 * CameraGate.tsx — the front door. A full-screen overlay shown until the loop is
 * running (`phase !== 'ready'`). It is user-triggered: the camera prompt only
 * fires on the Start click, which keeps getUserMedia inside a user gesture and
 * sidesteps StrictMode double-mount races.
 *
 * States: idle (Start) · requesting/loading (progress) · faulted (typed fault +
 * conditional retry). Pure presentation — all lifecycle lives in `useEngine`.
 */

import type { EnginePhase } from '../hooks/useEngine'
import type { CameraFault } from '../../engine/tracking/cameraErrors.pure'

interface CameraGateProps {
  phase: EnginePhase
  fault: CameraFault | null
  onStart: () => void
}

export default function CameraGate({ phase, fault, onStart }: CameraGateProps) {
  const busy = phase === 'requesting' || phase === 'loading'
  const failed = phase === 'faulted'
  // A non-retryable fault (insecure context / unsupported browser) can't be
  // fixed by clicking again — show guidance only, no button that re-fails.
  const showButton = !busy && (!failed || (fault?.retryable ?? true))

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

        {failed && fault && (
          <div className="gate-error" role="alert">
            <strong className="gate-error-title">{fault.title}</strong>
            <span className="gate-error-detail">{fault.detail}</span>
          </div>
        )}

        {showButton && (
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
