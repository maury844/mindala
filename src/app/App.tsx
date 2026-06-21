/**
 * App.tsx — the shell composition (IMPLEMENTATION-PLAN M5).
 *
 * One `useEngine` drives everything; the components below are pure presentation.
 * Stage/Cursor/PaletteDock/CameraPreview render immediately (so their refs exist
 * before `start()`), and the CameraGate overlays them until the loop is running.
 *
 * No engine logic lives here — only wiring and shell affordances (recenter via
 * button + spacebar, overlay toggle via `d`, a first-use hint).
 */

import { useEffect, useState } from 'react'
import { useEngine } from './hooks/useEngine'
import Stage from './components/Stage'
import Cursor from './components/Cursor'
import PaletteDock from './components/PaletteDock'
import CameraGate from './components/CameraGate'
import MandalaPicker from './components/MandalaPicker'
import CalibrationOverlay from './components/CalibrationOverlay'
import CameraPreview from './components/CameraPreview'
import DevOverlay from './components/DevOverlay'

export default function App() {
  const engine = useEngine()
  const ready = engine.phase === 'ready'
  const calibrating = engine.phase === 'calibrating'
  // The gate is the pre-loop front door; once calibration starts, its own
  // overlay takes over (the gate must not cover the calibration target).
  const showGate = !ready && !calibrating
  const { recenter, recalibrate, toggleOverlay } = engine

  // First-use hint: shown once the loop is live, dismissed on the first fill
  // (i.e. when the active color is repainted onto the mandala) or after a while.
  const [hintDismissed, setHintDismissed] = useState(false)

  // Keyboard affordances: Space = recenter / set neutral now, c = recalibrate,
  // d = toggle the dev overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        e.preventDefault()
        recenter()
      } else if (e.key === 'c' || e.key === 'C') {
        recalibrate()
      } else if (e.key === 'd' || e.key === 'D') {
        toggleOverlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [recenter, recalibrate, toggleOverlay])

  // Auto-fade the hint a few seconds after the loop starts.
  useEffect(() => {
    if (!ready || hintDismissed) return
    const t = window.setTimeout(() => setHintDismissed(true), 9000)
    return () => window.clearTimeout(t)
  }, [ready, hintDismissed])

  return (
    <div className="stage">
      <Stage stageRef={engine.stageRef} />
      <Cursor dotRef={engine.cursorRef} ringRef={engine.ringRef} visible={ready} />

      <PaletteDock
        colors={engine.doc.palettes[0].colors}
        paper={engine.doc.paper}
        activeColor={engine.activeColor}
        hoverSwatch={engine.hoverSwatch}
        onSelect={engine.setActiveColor}
      />

      <CameraPreview videoRef={engine.videoRef} visible={ready || calibrating} />
      <DevOverlay overlayRef={engine.overlayRef} visible={engine.overlayVisible} />

      {ready && (
        <>
          <MandalaPicker
            mandalas={engine.mandalas}
            activeId={engine.doc.id}
            onSelect={engine.selectMandala}
          />

          <button
            type="button"
            className="recenter-btn"
            onClick={recenter}
            title="Re-zero your neutral head pose now (Space) · press C to recalibrate"
          >
            Recenter
          </button>

          {!engine.hasFace && (
            <div className="face-hint" role="status">
              No face detected — make sure you're lit and centered in the camera.
            </div>
          )}

          {!hintDismissed && engine.hasFace && (
            <div className="use-hint" role="status">
              turn your head to move · relax to paint
            </div>
          )}

          {engine.degraded && (
            <div className="perf-hint" role="status">
              Low frame rate — close other tabs or apps for smoother control.
            </div>
          )}
        </>
      )}

      <CalibrationOverlay
        visible={calibrating}
        ringRef={engine.calibRingRef}
        countRef={engine.calibCountRef}
        statusRef={engine.calibStatusRef}
      />

      {showGate && (
        <CameraGate
          phase={engine.phase}
          fault={engine.fault}
          onStart={engine.start}
        />
      )}
    </div>
  )
}
