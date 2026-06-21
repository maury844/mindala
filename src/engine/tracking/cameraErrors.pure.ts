/**
 * cameraErrors.pure.ts — classify camera failures into typed, actionable faults.
 *
 * `getUserMedia` rejects with a `DOMException` whose `.name` is the only reliable
 * discriminator of *why* it failed. The raw message ("Permission denied",
 * "Could not start video source", …) is browser-specific and useless to a user,
 * so the shell used to just dump `String(err)` into one generic "blocked" card.
 *
 * This maps each failure mode to a stable `CameraFault` with a human-readable
 * title/detail and whether a "Try again" click can plausibly fix it. Pure — no
 * DOM, no React, no MediaPipe (part of `engine/`, `*.pure.ts`). The shell calls
 * `classifyCameraError` on a rejection and builds the non-error faults
 * (`unsupported` / `insecure` pre-flight, mid-session `lost`) via `faultOf`.
 */

export type CameraFaultKind =
  | 'denied' // user blocked the permission (NotAllowedError)
  | 'no-device' // no camera attached (NotFoundError / OverconstrainedError)
  | 'in-use' // camera held by another app (NotReadableError)
  | 'insecure' // not a secure context — needs HTTPS/localhost (SecurityError)
  | 'unsupported' // browser has no getUserMedia
  | 'lost' // stream ended mid-session (device unplugged / OS revoked)
  | 'model' // camera is fine, but the tracking model failed to load
  | 'unknown' // anything we can't place

export interface CameraFault {
  kind: CameraFaultKind
  /** Short heading for the gate card. */
  title: string
  /** One-sentence, action-oriented explanation. */
  detail: string
  /** Will a "Try again" click plausibly recover? (false → reload/config needed) */
  retryable: boolean
}

/** Single source for every fault's copy + retryability. */
const FAULTS: Record<CameraFaultKind, Omit<CameraFault, 'kind'>> = {
  denied: {
    title: 'Camera permission blocked',
    detail:
      "Click the camera icon in your browser's address bar, allow access, then try again.",
    retryable: true,
  },
  'no-device': {
    title: 'No camera found',
    detail:
      'Connect a webcam (or enable your built-in camera), then try again.',
    retryable: true,
  },
  'in-use': {
    title: 'Camera is busy',
    detail:
      'Another app (Zoom, Teams, FaceTime…) is using the camera. Close it, then try again.',
    retryable: true,
  },
  insecure: {
    title: 'Needs a secure connection',
    detail:
      'The camera only works over HTTPS or on localhost. Open the app from a secure URL.',
    retryable: false,
  },
  unsupported: {
    title: 'Camera not supported here',
    detail:
      "This browser can't reach the camera. Try a recent Chrome, Edge, Firefox, or Safari.",
    retryable: false,
  },
  lost: {
    title: 'Camera disconnected',
    detail: 'The camera feed stopped. Reconnect the camera, then try again.',
    retryable: true,
  },
  model: {
    title: "Couldn't load the tracker",
    detail:
      'The face-tracking model failed to download. Check your connection, then try again.',
    retryable: true,
  },
  unknown: {
    title: "Couldn't start the camera",
    detail: 'Something went wrong reaching the camera. Try again.',
    retryable: true,
  },
}

/** Build a full `CameraFault` for a known kind (for non-error faults). */
export function faultOf(kind: CameraFaultKind): CameraFault {
  return { kind, ...FAULTS[kind] }
}

/** Pull a DOMException-ish `.name` off an unknown rejection, defensively. */
function errorName(err: unknown): string {
  if (err && typeof err === 'object' && 'name' in err) {
    const name = (err as { name?: unknown }).name
    if (typeof name === 'string') return name
  }
  return ''
}

/**
 * Map a `getUserMedia` rejection to a `CameraFault`. The `DOMException.name` is
 * the discriminator; names come from the WebRTC / Media Capture specs and are
 * consistent across Chromium, Firefox, and WebKit.
 */
export function classifyCameraError(err: unknown): CameraFault {
  switch (errorName(err)) {
    case 'NotAllowedError': // permission denied or dismissed
    case 'PermissionDeniedError': // legacy Chrome alias
      return faultOf('denied')

    case 'NotFoundError': // no device matches the request
    case 'DevicesNotFoundError': // legacy alias
    case 'OverconstrainedError': // constraints (e.g. facingMode) unsatisfiable
    case 'ConstraintNotSatisfiedError': // legacy alias
      return faultOf('no-device')

    case 'NotReadableError': // OS/hardware refused — usually in use
    case 'TrackStartError': // legacy alias
    case 'AbortError': // device error mid-acquisition
      return faultOf('in-use')

    case 'SecurityError': // blocked by insecure context / policy
      return faultOf('insecure')

    case 'TypeError': // getUserMedia called with no media — treat as unsupported
      return faultOf('unsupported')

    default:
      return faultOf('unknown')
  }
}
