/**
 * PaletteDock.tsx — the left-edge color dock: 9 swatches + an eraser.
 *
 * Each swatch carries the `data-swatch` / `data-color` / `data-erase` attributes
 * `webView.resolveTargetAt` hit-tests, so the SAME dwell verb that fills a region
 * also selects a color here. Swatches are intentionally hittable (NOT
 * pointer-events:none) — that's how the head cursor lands on them. They're also
 * plain buttons, so a mouse can select too (handy for testing without a camera).
 *
 * `active` = the selected color (eraser when paper is active); `hover` = the
 * swatch under the cursor right now. Both come from `useEngine` state.
 */

interface PaletteDockProps {
  colors: string[]
  paper: string
  activeColor: string
  /** Swatch id under the cursor (`'0'..'8'` | `'erase'`), or null. */
  hoverSwatch: string | null
  onSelect: (color: string) => void
}

export default function PaletteDock({
  colors,
  paper,
  activeColor,
  hoverSwatch,
  onSelect,
}: PaletteDockProps) {
  const eraserActive = activeColor === paper

  return (
    <div className="dock">
      {colors.map((color, i) => {
        const id = String(i)
        const className = [
          'swatch',
          color === activeColor && !eraserActive ? 'active' : '',
          hoverSwatch === id ? 'hover' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <button
            key={id}
            type="button"
            className={className}
            data-swatch={id}
            data-color={color}
            style={{ background: color }}
            aria-label={`Color ${i + 1}`}
            title={color}
            onClick={() => onSelect(color)}
          />
        )
      })}

      <button
        type="button"
        className={[
          'swatch',
          'erase',
          eraserActive ? 'active' : '',
          hoverSwatch === 'erase' ? 'hover' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-swatch="erase"
        data-erase="1"
        aria-label="Eraser"
        title="Eraser — resets a region to paper"
        onClick={() => onSelect(paper)}
      />
    </div>
  )
}
