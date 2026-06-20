/**
 * generateMandala.pure.ts — rotate-copy one authored wedge into a spec SVG.
 *
 * `generate(motif, N)` emits a self-contained, MANDALA-SPEC-compliant SVG string
 * (viewBox `0 0 1000 1000`, centered on 500,500). For each k in 0..N-1 it wraps
 * the motif's shapes in `<g transform="rotate(k·360/N 500 500)">`, giving every
 * copy a unique `data-region-id` (`{shapeId}-w{k}`) while sharing the base
 * shape's `data-symmetry-group`. The center is emitted once as its own group.
 *
 * `describeRegions(motif, N)` returns the same logical structure (regions +
 * groups) without building a string — handy for tests and for an M5 region index.
 *
 * Marked `*.pure`: imports only `./types`. NO DOM, NO React. All DOM access for
 * mounting / hit-testing / filling lives in `webView.ts`.
 */

import type {
  MandalaDoc,
  Palette,
  Region,
  SymmetryGroup,
  WedgeMotif,
} from './types'

const CENTER = 500
const VIEWBOX = 1000
const CENTER_REGION_ID = 'center'

export interface GenerateOptions {
  /** Uncolored default fill for every region. */
  paper?: string
  /** Outline color (inherited by all regions). */
  stroke?: string
  /** Outline width in viewBox units. */
  strokeWidth?: number
  /**
   * Fill for the non-fillable background rect behind the art. Kept
   * `pointer-events:none` so cursor drift off the mandala never paints.
   */
  background?: string
}

const DEFAULTS = {
  paper: '#f4efe6',
  stroke: '#3a2f25',
  strokeWidth: 2.2,
  background: '#0d0f14',
} as const

/** `{shapeId}-w{k}` — the unique region id for wedge copy `k` of a base shape. */
function regionId(shapeId: string, k: number): string {
  return `${shapeId}-w${k}`
}

/** Trim trailing-zero noise from a rotation angle (e.g. 45, 22.5). */
function angle(k: number, n: number): string {
  return (Math.round(((k * 360) / n) * 1000) / 1000).toString()
}

/**
 * Build the spec SVG for `motif` rotate-copied `n` times.
 *
 * @throws if `n < 1`.
 */
export function generate(
  motif: WedgeMotif,
  n: number,
  opts: GenerateOptions = {},
): string {
  if (n < 1 || !Number.isInteger(n)) {
    throw new Error(`generate: symmetry order must be a positive integer (got ${n})`)
  }
  const paper = opts.paper ?? DEFAULTS.paper
  const stroke = opts.stroke ?? DEFAULTS.stroke
  const strokeWidth = opts.strokeWidth ?? DEFAULTS.strokeWidth
  const background = opts.background ?? DEFAULTS.background

  let wedges = ''
  for (let k = 0; k < n; k++) {
    let paths = ''
    for (const s of motif.shapes) {
      paths +=
        `<path data-region-id="${regionId(s.id, k)}"` +
        ` data-symmetry-group="${s.groupId}" d="${s.d}"/>`
    }
    wedges += `<g data-wedge="${k}" transform="rotate(${angle(k, n)} ${CENTER} ${CENTER})">${paths}</g>`
  }

  let center = ''
  const c = motif.center
  if (c) {
    const attrs = `data-region-id="${CENTER_REGION_ID}" data-symmetry-group="${c.groupId}"`
    if (c.circle) {
      center = `<circle ${attrs} cx="${c.circle.cx}" cy="${c.circle.cy}" r="${c.circle.r}"/>`
    } else if (c.d) {
      center = `<path ${attrs} d="${c.d}"/>`
    }
  }

  return (
    `<svg viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect data-role="background" x="0" y="0" width="${VIEWBOX}" height="${VIEWBOX}" fill="${background}" pointer-events="none"/>` +
    `<g data-layer="regions" fill="${paper}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round">` +
    wedges +
    center +
    `</g>` +
    `</svg>`
  )
}

/**
 * The logical region/group structure `generate()` produces, without the string.
 * Region ids and group membership match the SVG exactly (same `{id}-w{k}` scheme).
 */
export function describeRegions(
  motif: WedgeMotif,
  n: number,
): { regions: Region[]; groups: SymmetryGroup[] } {
  const regions: Region[] = []
  const groupOrder: string[] = []
  const byGroup = new Map<string, string[]>()

  const record = (id: string, group: string, wedge: number | null): void => {
    regions.push({ regionId: id, group, wedge })
    let ids = byGroup.get(group)
    if (!ids) {
      ids = []
      byGroup.set(group, ids)
      groupOrder.push(group)
    }
    ids.push(id)
  }

  for (let k = 0; k < n; k++) {
    for (const s of motif.shapes) record(regionId(s.id, k), s.groupId, k)
  }
  if (motif.center) record(CENTER_REGION_ID, motif.center.groupId, null)

  const groups = groupOrder.map((id) => ({
    id,
    regionIds: byGroup.get(id)!,
  }))
  return { regions, groups }
}

/** Convenience: assemble a {@link MandalaDoc} from a motif + its metadata. */
export function buildMandalaDoc(
  meta: { id: string; title: string; symmetryOrder: number; paper: string; palettes: Palette[] },
  motif: WedgeMotif,
): MandalaDoc {
  return {
    id: meta.id,
    title: meta.title,
    symmetryOrder: meta.symmetryOrder,
    paper: meta.paper,
    palettes: meta.palettes,
    svg: generate(motif, meta.symmetryOrder, { paper: meta.paper }),
  }
}
