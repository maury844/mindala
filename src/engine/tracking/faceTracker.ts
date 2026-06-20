/**
 * faceTracker.ts — per-frame head pose + blendshapes from a webcam stream.
 *
 * Wraps MediaPipe's `FaceLandmarker` (the validated config from the spikes) and
 * exposes a tiny, framework-free surface:
 *
 *   const tracker = new FaceTracker()
 *   await tracker.init()                 // downloads wasm + model (~3MB, once)
 *   const sample = tracker.detect(video, performance.now())
 *   tracker.close()                      // on teardown — frees GPU resources
 *
 * Part of `engine/` — imports nothing from React. It MAY touch MediaPipe and the
 * `<video>` element (a tracker is inherently a web/DOM adapter); the pure math it
 * relies on lives in `pose.pure.ts`.
 */

import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision'
import { matToEuler } from './pose.pure'

/** One frame's worth of head state. Angles in degrees; `jawOpen` in [0,1]. */
export interface FaceSample {
  /** false when no face is detected (or before `init`); other fields are 0. */
  hasFace: boolean
  yaw: number
  pitch: number
  roll: number
  /** `jawOpen` blendshape — RESERVED mouth clutch (not used in Phase A). */
  jawOpen: number
}

export interface FaceTrackerOptions {
  /** Base URL for the tasks-vision wasm bundle. Overridable for self-hosting. */
  wasmBasePath?: string
  /** URL of the `.task` model file. Overridable for self-hosting. */
  modelAssetPath?: string
  /** GPU is fastest; CPU is the portable fallback. */
  delegate?: 'GPU' | 'CPU'
  /** We only steer with one face. */
  numFaces?: number
}

// Pinned to match the spikes' validated CDN version (DISCOVERY §5 / §9).
const DEFAULT_WASM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm'
const DEFAULT_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

const NO_FACE: FaceSample = {
  hasFace: false,
  yaw: 0,
  pitch: 0,
  roll: 0,
  jawOpen: 0,
}

/** Read pose + jawOpen out of a MediaPipe result (null → no-face sample). */
function readSample(result: FaceLandmarkerResult | null): FaceSample {
  const mats = result?.facialTransformationMatrixes
  if (!mats || mats.length === 0) return { ...NO_FACE }

  const { yaw, pitch, roll } = matToEuler(mats[0].data)

  let jawOpen = 0
  const shapes = result?.faceBlendshapes
  if (shapes && shapes.length > 0) {
    const cat = shapes[0].categories.find((c) => c.categoryName === 'jawOpen')
    if (cat) jawOpen = cat.score
  }

  return { hasFace: true, yaw, pitch, roll, jawOpen }
}

export class FaceTracker {
  private landmarker: FaceLandmarker | null = null
  private lastVideoTime = -1
  private lastResult: FaceLandmarkerResult | null = null
  private readonly options: FaceTrackerOptions

  constructor(options: FaceTrackerOptions = {}) {
    this.options = options
  }

  /** True once `init()` has finished and `detect()` will run inference. */
  get ready(): boolean {
    return this.landmarker !== null
  }

  /** Download wasm + model and create the landmarker. Call once. */
  async init(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(
      this.options.wasmBasePath ?? DEFAULT_WASM,
    )
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: this.options.modelAssetPath ?? DEFAULT_MODEL,
        delegate: this.options.delegate ?? 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: this.options.numFaces ?? 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    })
  }

  /**
   * Sample the current frame.
   *
   * Inference only runs when the camera has produced a new frame
   * (`video.currentTime` advanced) — `detectForVideo` requires strictly
   * increasing timestamps. On every other call (or before `init`) we return the
   * last result, so the caller can drive this every rAF tick cheaply.
   */
  detect(video: HTMLVideoElement, nowMs: number): FaceSample {
    const landmarker = this.landmarker
    if (
      landmarker &&
      video.readyState >= 2 &&
      video.currentTime !== this.lastVideoTime
    ) {
      this.lastVideoTime = video.currentTime
      try {
        this.lastResult = landmarker.detectForVideo(video, nowMs)
      } catch {
        // detectForVideo throws on non-monotonic timestamps; keep the last
        // result rather than dropping a frame.
      }
    }
    return readSample(this.lastResult)
  }

  /** Free the landmarker (GPU buffers). Safe to call more than once. */
  close(): void {
    this.landmarker?.close()
    this.landmarker = null
    this.lastResult = null
    this.lastVideoTime = -1
  }
}
