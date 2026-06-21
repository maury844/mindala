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
import { floral01 } from '../../engine/mandala/floral01'
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
  /** The mounted mandala (title, palette, paper). */
  doc: MandalaDoc
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
   * calibration this completes the hold immediately instead.
   */
  recenter: () => void
  /** Re-show the calibration overlay to deliberately re-capture neutral. */
  recalibrate: () => void
  /** Select a palette color (also driven by a dwelled swatch). */
  setActiveColor: (color: string) => void
  toggleOverlay: () => void

  // Refs the shell wires onto DOM nodes; the loop reads/writes them directly.
  videoRef: RefObject<HTMLVideoElement | null>
  stageRef: RefObject<HTMLDivElement | null>
  cursorRef: RefObject<HTMLDivElement | null>
  ringRef: RefObject<HTMLDivElement | null>
  /** The calibration overlay's progress ring (loop writes its fill each frame). */
  calibRingRef: RefObject<HTMLDivElement | null>
  overlayRef: RefObject<HTMLPreElement | null>
}

export function useEngine(doc: MandalaDoc = floral01): EngineHandle {
  // DOM the shell owns.
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const ringRef = useRef<HTMLDivElement | null>(null)
  const calibRingRef = useRef<HTMLDivElement | null>(null)
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
  // cursor on the target and accumulates `calibElapsedRef` (only while a face is
  // tracked) until it reaches CALIBRATE.HOLD_SEC, then locks neutral + goes ready.
  const calibratingRef = useRef(false)
  const calibElapsedRef = useRef(0)

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

  const recenter = useCallback(() => {
    // "Set my neutral now." During calibration this also dismisses the overlay
    // by completing the hold on the next frame; otherwise it re-zeros instantly.
    if (calibratingRef.current) {
      calibElapsedRef.current = CALIBRATE.HOLD_SEC
    } else {
      cursorEngineRef.current?.recenter()
    }
  }, [])

  const recalibrate = useCallback(() => {
    if (!startedRef.current || calibratingRef.current) return
    calibElapsedRef.current = 0
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

  // Mount the mandala + create the (DOM-free) engine instances once the stage
  // container exists. Cleanup tears the whole session down (StrictMode-safe).
  useEffect(() => {
    const container = stageRef.current
    if (!container) return

    viewRef.current = mountMandala(container, doc.svg, { paper: doc.paper })
    cursorEngineRef.current = new VelocityCursor({
      width: window.innerWidth,
      height: window.innerHeight,
    })
    dwellRef.current = new DwellController({ paper: doc.paper })
    perfRef.current = new PerfMonitor()
    activeColorRef.current = doc.palettes[0].colors[0]

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      startedRef.current = false
      trackerRef.current?.close()
      trackerRef.current = null
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      viewRef.current?.unmount()
      viewRef.current = null
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
    // parks the cursor on the overlay target and captures neutral after a short
    // hold, so the user knows their resting pose is the origin (DESIGN #8).
    calibratingRef.current = true
    calibElapsedRef.current = 0
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

      // ── First-run calibration: park on target, capture neutral after a hold ─
      if (calibratingRef.current) {
        if (faceNow && sample && cursorEngine) {
          // Re-pend neutral every frame so the cursor sits still (delta 0) while
          // the smoother tracks the live pose; the final frame's capture is the
          // locked neutral. Only count the hold while a face is actually tracked.
          cursorEngine.recenter()
          cursorEngine.update(sample.yaw, sample.pitch, dt, {
            width: window.innerWidth,
            height: window.innerHeight,
          })
          calibElapsedRef.current += dt
        }

        const cprog = Math.min(calibElapsedRef.current / CALIBRATE.HOLD_SEC, 1)
        const cring = calibRingRef.current
        if (cring) {
          cring.style.background = `conic-gradient(var(--accent) ${cprog * 360}deg, rgba(255,255,255,.10) 0)`
        }
        if (faceNow !== hasFaceRef.current) {
          hasFaceRef.current = faceNow
          setHasFace(faceNow)
        }
        if (now - lastFpsPushRef.current > FPS_PUSH_MS) {
          lastFpsPushRef.current = now
          setFps(fpsRef.current)
        }

        if (cprog >= 1) {
          // Neutral is now locked to the settled pose; hand off to the run loop.
          calibratingRef.current = false
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
    toggleOverlay,
    videoRef,
    stageRef,
    cursorRef,
    ringRef,
    calibRingRef,
    overlayRef,
  }
}
