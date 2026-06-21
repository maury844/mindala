/**
 * Cursor.tsx — the head-driven cursor: a dot plus a radial dwell-progress ring.
 *
 * Both are dumb shells: `useEngine`'s loop writes their `transform`, the ring's
 * conic-gradient progress, and the dot's `.go` (charging) / `.lost` (no-face)
 * classes straight to these refs each frame. CRITICAL: both must stay
 * `pointer-events:none` (handled in CSS) so `document.elementFromPoint` resolves
 * the region/swatch underneath, not the cursor (DISCOVERY §9).
 */

import type { RefObject } from 'react'

interface CursorProps {
  dotRef: RefObject<HTMLDivElement | null>
  ringRef: RefObject<HTMLDivElement | null>
  /** Hidden until the loop is running so a stale dot doesn't sit on the gate. */
  visible: boolean
}

export default function Cursor({ dotRef, ringRef, visible }: CursorProps) {
  return (
    <div className="cursor-layer" data-visible={visible ? '1' : '0'} aria-hidden>
      <div className="dwell-ring" ref={ringRef} />
      <div className="cursor-dot" ref={dotRef} />
    </div>
  )
}
