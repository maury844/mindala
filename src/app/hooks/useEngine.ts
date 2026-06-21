/**
 * useEngine.ts — the ONE hook that drives the whole app (IMPLEMENTATION-PLAN M5).
 *
 * It owns the single rAF loop and the engine instances, and is the only place the
 * React shell touches `engine/`:
 *
 *   faceTracker.detect → velocityCursor.update → webView.resolveTargetAt
 *     → dwellController.update → apply the resulting fill/erase/selectColor event
 *
 * Per-frame visuals (the cursor dot + dwell ring + dev overlay) are written
 * straight to refs so a 60 fps loop never re-renders React. Only low-frequency
 * state (`phase`, `hasFace`, `fps`, `activeColor`, `hoverSwatch`) is mirrored into
 * React, updated on-change or throttled. Components stay dumb — no engine logic
 * leaks into them (architecture rule, CLAUDE.md / plan §Architecture).
 *
 * Lives in `app/`, so it MAY import React and the web adapter. The reverse is
 * banned by lint (engine/ never imports app/).
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { FaceTracker } from '../../engine/tracking/faceTracker'
import { VelocityCursor } from '../../engine/cursor/velocityCursor'
import {
  DwellController,
  type DwellEvent,
} from '../../engine/mandala/dwellController.pure'
import { mountMandala, type MandalaView } from '../../engine/mandala/webView'
import { MANDALAS } from '../../engine/mandala/registry'
import { DWELL, CALIBRATE } from '../../engine/config'
import type { MandalaDoc } from '../../engine/mandala/types'
import {
  classifyCameraError,
  faultOf,
  type CameraFault,
} from '../../engine/tracking/cameraErrors.pure'
import { PerfMonitor } from '../../engine/runtime/perfMonitor.pure'

/** Where the app is in the camera → model → run lifecycle. */
export type EnginePhase =
  | 'idle' // waiting for the user to start (camera not yet requested)
  | 'requesting' // getUserMedia prompt is up
  | 'loading' // camera granted; downloading the MediaPipe model (~3MB)
  | 'calibrating' // loop running; capturing the user's neutral pose (first-run)
  | 'ready' // loop is running
  | 'faulted' // camera/model failure — see `fault` (gate shows it + retry)

/** Largest dt we trust per frame — clamps tab-switch / GC spikes (spike parity). */
const MAX_DT = 0.05
/** How often (ms) to push the smoothed fps into React for the dev overlay. */
const FPS_PUSH_MS = 250

export interface EngineHandle {
  /** The currently mounted mandala (title, palette, paper). */
  doc: MandalaDoc
  /** Every selectable mandala, in registry order (for the picker). */
  mandalas: readonly MandalaDoc[]
  phase: EnginePhase
  /** Typed failure (title/detail/retryable) when `phase` is `faulted`. */
  fault: CameraFault | null
  hasFace: boolean
  fps: number
  /** True when the loop has run below a usable frame rate for a sustained spell. */
  degraded: boolean
  /** The color a region dwell will paint with (eraser = `doc.paper`). */
  activeColor: string
  /** Swatch id currently under the cursor (`'0'..'8'` | `'erase'`), for hover cue. */
  hoverSwatch: string | null
  overlayVisible: boolean

  /** Request the camera, load the model, and start the loop. User-triggered. */
  start: () => void
  /**
   * Re-zero the neutral head pose to wherever it rests now (instant). During
   * calibration this captures immediately, skipping the steady-pose countdown.
   */
  recenter: () => void
  /** Re-show the calibration overlay to deliberately re-capture neutral. */
  recalibrate: () => void
  /** Select a palette color (also driven by a dwelled swatch). */
  setActiveColor: (color: string) => void
  /**
   * Switch the mounted mandala by id. Remounts only the SVG + dwell state — the
   * camera, tracker, cursor and captured neutral pose are all preserved, so
   * switching mid-session doesn't force a recalibration.
   */
  selectMandala: (id: string) => void
  toggleOverlay: () => void

  // Refs the shell wires onto DOM nodes; the loop reads/writes them directly.
  videoRef: RefObject<HTMLVideoElement | null>
  stageRef: RefObject<HTMLDivElement | null>
  cursorRef: RefObject<HTMLDivElement | null>
  ringRef: RefObject<HTMLDivElement | null>
  /** The calibration overlay's countdown ring (loop writes its fill each frame). */
  calibRingRef: RefObject<HTMLDivElement | null>
  /** The calibration overlay's center countdown number (loop writes 3/2/1). */
  calibCountRef: RefObject<HTMLDivElement | null>
  /** The calibration overlay's status line (loop writes the face/settle/count copy). */
  calibStatusRef: RefObject<HTMLParagraphElement | null>
  overlayRef: RefObject<HTMLPreElement | null>
}

export function useEngine(
  mandalas: readonly MandalaDoc[] = MANDALAS,
): EngineHandle {
  // The mounted mandala; switching it remounts only the SVG (see the mandala
  // effect below), never the camera/cursor session.
  const [doc, setDoc] = useState<MandalaDoc>(mandalas[0])

  // DOM the shell owns.
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const ringRef = useRef<HTMLDivElement | null>(null)
  const calibRingRef = useRef<HTMLDivElement | null>(null)
  const calibCountRef = useRef<HTMLDivElement | null>(null)
  const calibStatusRef = useRef<HTMLParagraphElement | null>(null)
  const overlayRef = useRef<HTMLPreElement | null>(null)

  // Engine instances + loop bookkeeping — all mutable, none drive renders.
  const trackerRef = useRef<FaceTracker | null>(null)
  const cursorEngineRef = useRef<VelocityCursor | null>(null)
  const dwellRef = useRef<DwellController | null>(null)
  const viewRef = useRef<MandalaView | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const perfRef = useRef<PerfMonitor | null>(null)
  const rafRef = useRef<number | null>(null)
  const startedRef = useRef(false)
  // First-run calibration: while `calibratingRef` is set, the loop parks the
  // cursor on the target and runs a stillness-gated countdown (see `calibState`):
  // wait for the head to settle, then count down CALIBRATE.COUNT_SEC and lock
  // neutral. A clear move aborts the countdown; Space forces it.
  const calibratingRef = useRef(false)
  const makeCalibState = () => ({
    counting: false, // settling (false) → counting down (true)
    stillTimer: 0, // seconds the head has stayed still (settle debounce)
    countTimer: 0, // seconds into the steady-pose countdown
    rate: 0, // EMA-smoothed head turn-rate (deg/s)
    prevYaw: 0,
    prevPitch: 0,
    havePrev: false,
    force: false, // Space → capture now regardless of stillness
  })
  const calibStateRef = useRef(makeCalibState())

  const lastTRef = useRef(0)
  const fpsRef = useRef(0)
  const lastFpsPushRef = useRef(0)
  const activeColorRef = useRef<string>(doc.palettes[0].colors[0])
  const hasFaceRef = useRef(false)
  const hoverRef = useRef<string | null>(null)
  const overlayVisibleRef = useRef(false)
  const degradedRef = useRef(false)

  // Low-frequency state mirrored into React for rendering.
  const [phase, setPhase] = useState<EnginePhase>('idle')
  const [fault, setFault] = useState<CameraFault | null>(null)
  const [hasFace, setHasFace] = useState(false)
  const [fps, setFps] = useState(0)
  const [degraded, setDegraded] = useState(false)
  const [activeColor, setActiveColorState] = useState(doc.palettes[0].colors[0])
  const [hoverSwatch, setHoverSwatch] = useState<string | null>(null)
  const [overlayVisible, setOverlayVisible] = useState(false)

  const setActiveColor = useCallback((color: string) => {
    activeColorRef.current = color
    setActiveColorState(color)
  }, [])

  const selectMandala = useCallback(
    (id: string) => {
      const next = mandalas.find((m) => m.id === id)
      if (next) setDoc(next)
    },
    [mandalas],
  )

  const recenter = useCallback(() => {
    // "Set my neutral now." During calibration this forces an immediate capture
    // (skipping the steady-pose countdown); otherwise it re-zeros instantly.
    if (calibratingRef.current) {
      calibStateRef.current.force = true
    } else {
      cursorEngineRef.current?.recenter()
    }
  }, [])

  const recalibrate = useCallback(() => {
    if (!startedRef.current || calibratingRef.current) return
    calibStateRef.current = makeCalibState()
    calibratingRef.current = true
    setPhase('calibrating')
  }, [])

  const toggleOverlay = useCallback(() => {
    overlayVisibleRef.current = !overlayVisibleRef.current
    setOverlayVisible(overlayVisibleRef.current)
    // Clear stale text when hiding so it doesn't flash on next show.
    if (!overlayVisibleRef.current && overlayRef.current) {
      overlayRef.current.textContent = ''
    }
  }, [])

  // Tear the live session down and surface a typed fault. Drives both the
  // `start()` failure paths and mid-session camera loss (`track.ended`), so it
  // must be safe to call from an async path or a DOM event, and idempotent. The
  // mount-effect cleanup remains the unmount path; this is the "recoverable
  // failure" path that re-arms `start()` for a retry.
  const failSession = useCallback((f: CameraFault) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    trackerRef.current?.close()
    trackerRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    startedRef.current = false
    degradedRef.current = false
    setDegraded(false)
    setFault(f)
    setPhase('faulted')
  }, [])

  // Session lifecycle (camera/cursor): the DOM-free engine instances that live
  // for the whole session, created once. Cleanup tears the camera session down
  // (StrictMode-safe). This deliberately does NOT depend on `doc`, so switching
  // the mandala never stops the camera or drops the captured neutral pose.
  useEffect(() => {
    cursorEngineRef.current = new VelocityCursor({
      width: window.innerWidth,
      height: window.innerHeight,
    })
    perfRef.current = new PerfMonitor()

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      startedRef.current = false
      trackerRef.current?.close()
      trackerRef.current = null
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  // Mandala mount: (re)mounts the selected mandala's SVG into the stage and gives
  // the dwell loop a fresh controller for its paper. Re-runs whenever `doc`
  // changes (the picker) — the running rAF loop reads `viewRef`/`dwellRef` afresh
  // each frame, so it picks up the swap without a restart. Active color resets to
  // the new palette's first swatch. The view unmounts on cleanup.
  useEffect(() => {
    const container = stageRef.current
    if (!container) return

    const view = mountMandala(container, doc.svg, { paper: doc.paper })
    viewRef.current = view
    dwellRef.current = new DwellController({ paper: doc.paper })
    activeColorRef.current = doc.palettes[0].colors[0]
    setActiveColorState(doc.palettes[0].colors[0])

    return () => {
      view.unmount()
      if (viewRef.current === view) viewRef.current = null
    }
  }, [doc])

  const start = useCallback(async () => {
    if (startedRef.current) return
    startedRef.current = true
    setFault(null)

    // Pre-flight: fail fast with the right message before even prompting, so a
    // non-HTTPS deploy or an old browser doesn't surface as a vague "blocked".
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      failSession(faultOf('insecure'))
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      failSession(faultOf('unsupported'))
      return
    }

    setPhase('requesting')

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      })
    } catch (err) {
      failSession(classifyCameraError(err))
      return
    }
    streamRef.current = stream

    // Mid-session camera loss (unplug / OS revoke / another app steals it) ends
    // the track. Without this the loop would spin forever on a frozen frame; we
    // tear down and fall back to the gate with a "disconnected" retry instead.
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (startedRef.current) failSession(faultOf('lost'))
      })
    })

    const video = videoRef.current
    if (!video) {
      failSession(faultOf('unknown'))
      return
    }
    video.srcObject = stream
    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => resolve()
    })
    await video.play()

    setPhase('loading')
    const tracker = new FaceTracker()
    try {
      await tracker.init()
    } catch {
      failSession(faultOf('model'))
      return
    }
    trackerRef.current = tracker

    // Enter first-run calibration instead of going straight to ready: the loop
    // parks the cursor on the overlay target and captures neutral once the head
    // settles, so the user knows their resting pose is the origin (DESIGN #8).
    calibStateRef.current = makeCalibState()
    calibratingRef.current = true
    setPhase('calibrating')

    lastTRef.current = 0
    perfRef.current?.reset()

    const frame = (now: number): void => {
      const last = lastTRef.current || now
      const dt = Math.min(MAX_DT, (now - last) / 1000)
      lastTRef.current = now
      if (dt > 0) fpsRef.current += (1 / dt - fpsRef.current) * 0.1

      const cursorEngine = cursorEngineRef.current
      const view = viewRef.current
      const dwell = dwellRef.current
      const videoEl = videoRef.current
      const tr = trackerRef.current

      // Detect once per frame; the sample feeds both calibration and the run loop.
      const sample = videoEl && tr ? tr.detect(videoEl, now) : null
      const faceNow = sample?.hasFace ?? false

      // ── First-run calibration: settle, then count down a steady hold ───────
      if (calibratingRef.current) {
        const cs = calibStateRef.current

        if (faceNow && sample && cursorEngine) {
          // Re-pend neutral every frame so the cursor sits still (delta 0) while
          // the smoother tracks the live pose; the frame we finish on becomes the
          // locked neutral. (Capture is continuous; the timers below only decide
          // WHEN we stop — they never move the neutral themselves.)
          cursorEngine.recenter()
          cursorEngine.update(sample.yaw, sample.pitch, dt, {
            width: window.innerWidth,
            height: window.innerHeight,
          })

          // Head turn-rate (deg/s), EMA-smoothed, as the "is it moving?" signal.
          let inst = 0
          if (cs.havePrev && dt > 0) {
            inst =
              Math.hypot(sample.yaw - cs.prevYaw, sample.pitch - cs.prevPitch) / dt
          }
          cs.prevYaw = sample.yaw
          cs.prevPitch = sample.pitch
          cs.havePrev = true
          cs.rate += (inst - cs.rate) * 0.3

          if (!cs.counting) {
            // Settling: wait for the head to hold still long enough to begin.
            cs.stillTimer = cs.rate < CALIBRATE.STILL_RATE ? cs.stillTimer + dt : 0
            if (cs.stillTimer >= CALIBRATE.SETTLE_SEC) {
              cs.counting = true
              cs.countTimer = 0
            }
          } else if (cs.rate > CALIBRATE.MOVE_RATE) {
            // Counting: a clear move (hysteresis vs STILL_RATE) restarts settling.
            cs.counting = false
            cs.stillTimer = 0
            cs.countTimer = 0
          } else {
            cs.countTimer += dt
          }
        } else {
          // No face: reset the machine — never count down a missing head.
          cs.counting = false
          cs.stillTimer = 0
          cs.countTimer = 0
          cs.havePrev = false
          cs.rate = 0
        }

        const done = cs.force || cs.countTimer >= CALIBRATE.COUNT_SEC

        // ── Per-frame overlay visuals (refs, no React re-render) ──────────────
        const cprog = cs.counting
          ? Math.min(cs.countTimer / CALIBRATE.COUNT_SEC, 1)
          : 0
        if (calibRingRef.current) {
          calibRingRef.current.style.background = `conic-gradient(var(--accent) ${cprog * 360}deg, rgba(255,255,255,.10) 0)`
        }
        if (calibCountRef.current) {
          calibCountRef.current.textContent = cs.counting
            ? String(Math.max(1, Math.ceil(CALIBRATE.COUNT_SEC - cs.countTimer)))
            : ''
        }
        const status = !faceNow
          ? { text: 'Position your face in the camera (corner preview).', state: 'noface' }
          : cs.counting
            ? { text: 'Capturing — keep steady…', state: 'counting' }
            : { text: 'Look straight at the camera and hold still…', state: 'settling' }
        const sEl = calibStatusRef.current
        if (sEl && sEl.dataset.state !== status.state) {
          sEl.textContent = status.text
          sEl.dataset.state = status.state
        }

        if (faceNow !== hasFaceRef.current) {
          hasFaceRef.current = faceNow
          setHasFace(faceNow)
        }
        if (now - lastFpsPushRef.current > FPS_PUSH_MS) {
          lastFpsPushRef.current = now
          setFps(fpsRef.current)
        }

        if (done) {
          // Neutral is now locked to the settled pose; hand off to the run loop.
          calibratingRef.current = false
          cs.force = false
          setPhase('ready')
        }

        rafRef.current = requestAnimationFrame(frame)
        return
      }

      // Cursor freezes at its last position when no face is present, and
      // `speed = Infinity` keeps the must-stop gate closed (face-loss never
      // moves or paints — plan M6 / DISCOVERY §9).
      let x = cursorEngine?.position.x ?? 0
      let y = cursorEngine?.position.y ?? 0
      let speed = Infinity

      if (faceNow && sample && cursorEngine) {
        const s = cursorEngine.update(sample.yaw, sample.pitch, dt, {
          width: window.innerWidth,
          height: window.innerHeight,
        })
        x = s.x
        y = s.y
        speed = s.speed
      }

      let progress = 0
      let charging = false
      const target = view?.resolveTargetAt(x, y) ?? null
      if (dwell) {
        const st = dwell.update({
          target,
          speed,
          dt,
          activeColor: activeColorRef.current,
        })
        progress = st.progress
        charging = st.charging
        if (st.event) applyEvent(st.event, view)
      }

      // ── Per-frame visuals (refs, no React) ────────────────────────────────
      const overSwatch = target?.kind === 'swatch'
      const dot = cursorRef.current
      if (dot) {
        dot.style.transform = `translate(${x}px, ${y}px)`
        dot.classList.toggle('go', charging)
        dot.classList.toggle('lost', !faceNow)
      }
      const ring = ringRef.current
      if (ring) {
        ring.style.transform = `translate(${x}px, ${y}px)`
        ring.style.opacity = progress > 0.01 ? (charging ? '1' : '0.35') : '0'
        const col = overSwatch ? 'var(--accent2)' : 'var(--accent)'
        ring.style.background = `conic-gradient(${col} ${progress * 360}deg, rgba(255,255,255,.08) 0)`
      }

      // ── Low-frequency state (on-change / throttled) ───────────────────────
      if (faceNow !== hasFaceRef.current) {
        hasFaceRef.current = faceNow
        setHasFace(faceNow)
      }
      const hoverKey = overSwatch ? target.key.slice(3) : null
      if (hoverKey !== hoverRef.current) {
        hoverRef.current = hoverKey
        setHoverSwatch(hoverKey)
      }
      if (now - lastFpsPushRef.current > FPS_PUSH_MS) {
        lastFpsPushRef.current = now
        setFps(fpsRef.current)
      }
      // Weak-hardware warning: only flips on the (de)graded edge.
      const nowDegraded = perfRef.current?.sample(fpsRef.current, dt) ?? false
      if (nowDegraded !== degradedRef.current) {
        degradedRef.current = nowDegraded
        setDegraded(nowDegraded)
      }

      if (overlayVisibleRef.current && overlayRef.current) {
        const over = target ? target.key : '–'
        const pct = `${Math.round(progress * 100)}%`
        const note = charging ? ' ✓' : speed > DWELL.MUST_STOP ? ' (moving)' : ''
        overlayRef.current.textContent = [
          `fps     ${fpsRef.current.toFixed(0)}`,
          `face    ${faceNow ? 'yes' : 'no'}`,
          `over    ${over}`,
          `prog    ${pct}${note}`,
          `color   ${activeColorRef.current}`,
        ].join('\n')
      }

      rafRef.current = requestAnimationFrame(frame)
    }

    const applyEvent = (e: DwellEvent, view: MandalaView | null): void => {
      switch (e.kind) {
        case 'selectColor':
          setActiveColor(e.color)
          break
        case 'fill':
          view?.fillGroup(e.group, e.color)
          break
        case 'erase':
          view?.eraseGroup(e.group)
          break
      }
    }

    rafRef.current = requestAnimationFrame(frame)
  }, [setActiveColor, failSession])

  return {
    doc,
    mandalas,
    phase,
    fault,
    hasFace,
    fps,
    degraded,
    activeColor,
    hoverSwatch,
    overlayVisible,
    start,
    recenter,
    recalibrate,
    setActiveColor,
    selectMandala,
    toggleOverlay,
    videoRef,
    stageRef,
    cursorRef,
    ringRef,
    calibRingRef,
    calibCountRef,
    calibStatusRef,
    overlayRef,
  }
}
