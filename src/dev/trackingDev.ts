/**
 * trackingDev.ts — THROWAWAY dev harness for M1 (not shipped).
 *
 * Served at /tracking.html by `vite dev` only (it is not an input to the
 * production build). It exercises `engine/tracking/` end-to-end: opens the
 * webcam, runs the FaceTracker, and shows live {yaw, pitch, roll, jawOpen, fps}
 * so you can eyeball the AC ("≥15 fps with a face present").
 *
 * This lives outside `engine/`, so it is free to touch the DOM directly.
 */

import { FaceTracker, type FaceSample } from '../engine/tracking/faceTracker'

const root = document.getElementById('app')!

const video = document.createElement('video')
video.autoplay = true
video.playsInline = true
video.muted = true

const preview = document.createElement('div')
preview.className = 'preview'
preview.appendChild(video)

const readout = document.createElement('pre')
readout.className = 'readout'
readout.textContent = 'starting…'

const status = document.createElement('div')
status.className = 'status'
status.textContent = 'Requesting camera & loading model…'

root.append(status, preview, readout)

function fmt(s: FaceSample, fps: number): string {
  return [
    `fps    ${fps.toFixed(0)}`,
    `face   ${s.hasFace ? 'yes' : 'no'}`,
    `yaw    ${s.yaw.toFixed(1)}°`,
    `pitch  ${s.pitch.toFixed(1)}°`,
    `roll   ${s.roll.toFixed(1)}°`,
    `jaw    ${(s.jawOpen * 100).toFixed(0)}%`,
  ].join('\n')
}

async function main(): Promise<void> {
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    })
  } catch (err) {
    status.textContent = `Camera blocked — allow access and reload. (${String(err)})`
    return
  }

  video.srcObject = stream
  await new Promise<void>((resolve) => {
    video.onloadedmetadata = () => resolve()
  })
  await video.play()

  const tracker = new FaceTracker()
  try {
    await tracker.init()
  } catch (err) {
    status.textContent = `Model failed to load. (${String(err)})`
    return
  }

  status.textContent = 'Tracking — turn/nod/tilt your head; open your mouth.'

  let lastT = performance.now()
  let fps = 0
  let lastLog = 0

  const loop = (): void => {
    const now = performance.now()
    const dt = Math.min(0.05, (now - lastT) / 1000)
    lastT = now
    fps += (1 / Math.max(dt, 1e-3) - fps) * 0.1

    const sample = tracker.detect(video, now)
    readout.textContent = fmt(sample, fps)

    // Throttle console spam to ~2Hz; satisfies the "logs {yaw,pitch,jawOpen}" AC.
    if (sample.hasFace && now - lastLog > 500) {
      lastLog = now
      console.log('[tracking]', {
        yaw: +sample.yaw.toFixed(1),
        pitch: +sample.pitch.toFixed(1),
        jawOpen: +sample.jawOpen.toFixed(2),
        fps: +fps.toFixed(0),
      })
    }

    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

void main()
