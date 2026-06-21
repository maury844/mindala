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
import { DWELL } from '../../engine/config'
import type { MandalaDoc } from '../../engine/mandala/types'

/** Where the app is in the camera → model → run lifecycle. */
export type EnginePhase =
  | 'idle' // waiting for the user to start (camera not yet requested)
  | 'requesting' // getUserMedia prompt is up
  | 'loading' // camera granted; downloading the MediaPipe model (~3MB)
  | 'ready' // loop is running
  | 'denied' // camera permission refused
  | 'error' // model failed to load (or no <video>)

/** Largest dt we trust per frame — clamps tab-switch / GC spikes (spike parity). */
const MAX_DT = 0.05
/** How often (ms) to push the smoothed fps into React for the dev overlay. */
const FPS_PUSH_MS = 250

export interface EngineHandle {
  /** The mounted mandala (title, palette, paper). */
  doc: MandalaDoc
  phase: EnginePhase
  /** Human-readable reason when `phase` is `denied` / `error`. */
  errorMessage: string | null
  hasFace: boolean
  fps: number
  /** The color a region dwell will paint with (eraser = `doc.paper`). */
  activeColor: string
  /** Swatch id currently under the cursor (`'0'..'8'` | `'erase'`), for hover cue. */
  hoverSwatch: string | null
  overlayVisible: boolean

  /** Request the camera, load the model, and start the loop. User-triggered. */
  start: () => void
  /** Re-zero the neutral head pose to wherever it rests now. */
  recenter: () => void
  /** Select a palette color (also driven by a dwelled swatch). */
  setActiveColor: (color: string) => void
  toggleOverlay: () => void

  // Refs the shell wires onto DOM nodes; the loop reads/writes them directly.
  videoRef: RefObject<HTMLVideoElement | null>
  stageRef: RefObject<HTMLDivElement | null>
  cursorRef: RefObject<HTMLDivElement | null>
  ringRef: RefObject<HTMLDivElement | null>
  overlayRef: RefObject<HTMLPreElement | null>
}

export function useEngine(doc: MandalaDoc = floral01): EngineHandle {
  // DOM the shell owns.
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const ringRef = useRef<HTMLDivElement | null>(null)
  const overlayRef = useRef<HTMLPreElement | null>(null)

  // Engine instances + loop bookkeeping — all mutable, none drive renders.
  const trackerRef = useRef<FaceTracker | null>(null)
  const cursorEngineRef = useRef<VelocityCursor | null>(null)
  const dwellRef = useRef<DwellController | null>(null)
  const viewRef = useRef<MandalaView | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const startedRef = useRef(false)

  const lastTRef = useRef(0)
  const fpsRef = useRef(0)
  const lastFpsPushRef = useRef(0)
  const activeColorRef = useRef<string>(doc.palettes[0].colors[0])
  const hasFaceRef = useRef(false)
  const hoverRef = useRef<string | null>(null)
  const overlayVisibleRef = useRef(false)

  // Low-frequency state mirrored into React for rendering.
  const [phase, setPhase] = useState<EnginePhase>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [hasFace, setHasFace] = useState(false)
  const [fps, setFps] = useState(0)
  const [activeColor, setActiveColorState] = useState(doc.palettes[0].colors[0])
  const [hoverSwatch, setHoverSwatch] = useState<string | null>(null)
  const [overlayVisible, setOverlayVisible] = useState(false)

  const setActiveColor = useCallback((color: string) => {
    activeColorRef.current = color
    setActiveColorState(color)
  }, [])

  const recenter = useCallback(() => {
    cursorEngineRef.current?.recenter()
  }, [])

  const toggleOverlay = useCallback(() => {
    overlayVisibleRef.current = !overlayVisibleRef.current
    setOverlayVisible(overlayVisibleRef.current)
    // Clear stale text when hiding so it doesn't flash on next show.
    if (!overlayVisibleRef.current && overlayRef.current) {
      overlayRef.current.textContent = ''
    }
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
    setErrorMessage(null)
    setPhase('requesting')

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      })
    } catch (err) {
      startedRef.current = false
      setErrorMessage(
        `Camera access was blocked. Allow it in your browser, then try again. (${String(err)})`,
      )
      setPhase('denied')
      return
    }
    streamRef.current = stream

    const video = videoRef.current
    if (!video) {
      setErrorMessage('Internal error: no <video> element to attach the camera.')
      setPhase('error')
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
    } catch (err) {
      setErrorMessage(
        `The face-tracking model failed to load — check your connection and retry. (${String(err)})`,
      )
      setPhase('error')
      return
    }
    trackerRef.current = tracker
    setPhase('ready')

    lastTRef.current = 0

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

      // Cursor freezes at its last position when no face is present, and
      // `speed = Infinity` keeps the must-stop gate closed (face-loss never
      // moves or paints — plan M6 / DISCOVERY §9).
      let x = cursorEngine?.position.x ?? 0
      let y = cursorEngine?.position.y ?? 0
      let speed = Infinity
      let faceNow = false

      if (videoEl && tr && cursorEngine) {
        const sample = tr.detect(videoEl, now)
        faceNow = sample.hasFace
        if (sample.hasFace) {
          const s = cursorEngine.update(sample.yaw, sample.pitch, dt, {
            width: window.innerWidth,
            height: window.innerHeight,
          })
          x = s.x
          y = s.y
          speed = s.speed
        }
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
  }, [setActiveColor])

  return {
    doc,
    phase,
    errorMessage,
    hasFace,
    fps,
    activeColor,
    hoverSwatch,
    overlayVisible,
    start,
    recenter,
    setActiveColor,
    toggleOverlay,
    videoRef,
    stageRef,
    cursorRef,
    ringRef,
    overlayRef,
  }
}
