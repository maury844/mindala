/**
 * DevOverlay.tsx — the toggleable diagnostics readout (port of the spikes' HUD).
 *
 * The loop writes fps / face / over / progress / color straight into this `<pre>`
 * every frame via `overlayRef`, so the panel never re-renders. Toggle with the
 * `d` key (wired in App). Hidden by default — it's a dev aid, not chrome.
 */

import type { RefObject } from 'react'

interface DevOverlayProps {
  overlayRef: RefObject<HTMLPreElement | null>
  visible: boolean
}

export default function DevOverlay({ overlayRef, visible }: DevOverlayProps) {
  if (!visible) return null
  return <pre className="dev-overlay" ref={overlayRef} />
}
