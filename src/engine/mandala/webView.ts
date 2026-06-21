/**
 * webView.ts — the WEB ADAPTER for a mandala (the only DOM in `engine/mandala`).
 *
 * Mounts a generated SVG string into a container and exposes the three things the
 * render loop needs: hit-test the point under the cursor, fill a symmetry group,
 * and erase one back to paper. Everything here touches the DOM; the geometry
 * (`generate`) and the dwell logic (M4) stay pure and DOM-free.
 *
 * Hit-testing follows the spike (`spike/dwell.html`): `document.elementFromPoint`
 * → walk up to the nearest tagged ancestor. It resolves BOTH palette swatches
 * (`[data-swatch]`, owned by the React dock in M5) and fillable regions
 * (`[data-symmetry-group]`), so the one dwell verb can target either. This needs
 * the cursor element to be `pointer-events:none` (DISCOVERY §9) or elementFrom
 * Point returns the cursor instead.
 *
 * Part of `engine/` — imports nothing from React.
 */

import type { DwellTarget } from './dwellController.pure'

const PAPER_FALLBACK = '#f4efe6'

/**
 * What the cursor is currently over, normalized for the dwell controller. The
 * canonical shape lives in `dwellController.pure.ts` (the consumer); this adapter
 * just produces it, so the shell can pipe `resolveTargetAt` straight into the
 * controller. Re-exported here for callers that only touch the web adapter.
 */
export type Target = DwellTarget

export interface MountOptions {
  /** Paper color the eraser resets to. Defaults to the mandala's `paper`. */
  paper?: string
}

export interface MandalaView {
  /** The mounted `<svg>` element. */
  readonly el: SVGSVGElement
  /** Resolve the swatch/region under a viewport point, or `null` for neither. */
  resolveTargetAt(x: number, y: number): Target | null
  /** Paint every region in a symmetry group (mirrored fill). */
  fillGroup(group: string, color: string): void
  /** Reset every region in a group back to paper. */
  eraseGroup(group: string): void
  /** Current fill of a group (reads its first region), or `null` if unknown. */
  groupColor(group: string): string | null
  /** Remove the SVG from the DOM. */
  unmount(): void
}

/** Mount `svg` (a generated string) into `container` and return a live handle. */
export function mountMandala(
  container: HTMLElement,
  svg: string,
  opts: MountOptions = {},
): MandalaView {
  const paper = opts.paper ?? PAPER_FALLBACK
  container.innerHTML = svg
  const el = container.querySelector('svg')
  if (!el) throw new Error('mountMandala: no <svg> found in the provided markup')

  const groupSelector = (group: string): string =>
    `[data-symmetry-group="${CSS.escape(group)}"]`

  const fillGroup = (group: string, color: string): void => {
    el.querySelectorAll(groupSelector(group)).forEach((node) =>
      node.setAttribute('fill', color),
    )
  }

  return {
    el,

    resolveTargetAt(x, y) {
      const hit = document.elementFromPoint(x, y)
      if (!hit) return null

      const swatch = hit.closest<HTMLElement>('[data-swatch]')
      if (swatch) {
        return {
          kind: 'swatch',
          key: `sw:${swatch.dataset.swatch ?? ''}`,
          color: swatch.dataset.color ?? paper,
          erase: swatch.dataset.erase === '1',
        }
      }

      const region = hit.closest<Element>('[data-symmetry-group]')
      if (region) {
        const group = region.getAttribute('data-symmetry-group') ?? ''
        return { kind: 'region', key: `rg:${group}`, group }
      }

      return null
    },

    fillGroup,

    eraseGroup(group) {
      fillGroup(group, paper)
    },

    groupColor(group) {
      const first = el.querySelector(groupSelector(group))
      return first?.getAttribute('fill') ?? null
    },

    unmount() {
      el.remove()
    },
  }
}
