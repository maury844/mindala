/**
 * CameraPreview.tsx — a small mirrored self-view in the corner.
 *
 * The `<video>` must exist BEFORE `start()` runs (the loop reads frames from it),
 * so it's always rendered and merely hidden until the camera is live. Mirrored
 * (`scaleX(-1)`) for a natural self-view; this does NOT affect the pose math —
 * axis signs are handled by `INVERT_X/Y` (DISCOVERY §9).
 */

import type { RefObject } from 'react'

interface CameraPreviewProps {
  videoRef: RefObject<HTMLVideoElement | null>
  visible: boolean
}

export default function CameraPreview({ videoRef, visible }: CameraPreviewProps) {
  return (
    <div className="camera-preview" data-visible={visible ? '1' : '0'}>
      <video ref={videoRef} autoPlay playsInline muted />
    </div>
  )
}
