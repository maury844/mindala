/**
 * MandalaPicker.tsx — top-left chrome to switch between the shipped mandalas.
 *
 * Each option is a live thumbnail of the mandala's own generated SVG (the same
 * markup the stage mounts), so the picker always reflects the real asset. Like
 * the recenter button it's a mouse-clickable control (not head-dwellable) — a
 * meta-control, not part of the coloring surface. Selecting one calls
 * `engine.selectMandala`, which swaps the mounted SVG without touching the camera
 * session (so no recalibration).
 *
 * Pure presentation: it renders from `useEngine` state and reports clicks back.
 * Hidden when there's only one mandala to choose from.
 */

import type { MandalaDoc } from '../../engine/mandala/types'

interface MandalaPickerProps {
  mandalas: readonly MandalaDoc[]
  /** Id of the currently mounted mandala. */
  activeId: string
  onSelect: (id: string) => void
}

export default function MandalaPicker({
  mandalas,
  activeId,
  onSelect,
}: MandalaPickerProps) {
  if (mandalas.length < 2) return null

  return (
    <div className="mandala-picker" role="group" aria-label="Choose a mandala">
      {mandalas.map((m) => (
        <button
          key={m.id}
          type="button"
          className={['thumb', m.id === activeId ? 'active' : '']
            .filter(Boolean)
            .join(' ')}
          aria-label={m.title}
          aria-pressed={m.id === activeId}
          title={m.title}
          onClick={() => onSelect(m.id)}
        >
          <span
            className="thumb-art"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: m.svg }}
          />
        </button>
      ))}
    </div>
  )
}
