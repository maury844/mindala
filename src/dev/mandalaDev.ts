/**
 * mandalaDev.ts — THROWAWAY dev harness for M3 (not shipped).
 *
 * Served at /mandala.html by `vite dev` only. It renders the generated
 * `floral01` mandala at the AC reference size (600px), demonstrates mirrored
 * group-fills, and verifies the two rendered acceptance criteria that need real
 * SVG geometry (so they can't run in jsdom):
 *   - no two fillable regions overlap (200-point `elementsFromPoint` spot-check);
 *   - the smallest fillable region clears the 40px dwell target.
 *
 * Lives outside `engine/`, so it may touch the DOM directly.
 */

import { floral01 } from '../engine/mandala/floral01'
import { mountMandala } from '../engine/mandala/webView'

const RENDER_PX = 600

const root = document.getElementById('app')!
root.style.setProperty('--render', `${RENDER_PX}px`)

const holder = document.createElement('div')
holder.className = 'mandala'

const readout = document.createElement('pre')
readout.className = 'readout'
readout.textContent = 'rendering…'

root.append(holder, readout)

const view = mountMandala(holder, floral01.svg, { paper: floral01.paper })

// Demonstrate mirrored group-fills (and that the result reads floral) — leaves
// the outer "point" petals as paper so the uncolored state shows too.
const pal = floral01.palettes[0].colors
view.fillGroup('center', pal[3])
view.fillGroup('petal', pal[0])
view.fillGroup('heart', pal[4])
view.fillGroup('scroll', pal[8])

interface OverlapResult {
  maxHits: number
  onRegion: number
  samples: number
}

function overlapSpotCheck(samples = 200): OverlapResult {
  const rect = view.el.getBoundingClientRect()
  let maxHits = 0
  let onRegion = 0
  for (let i = 0; i < samples; i++) {
    const x = rect.left + Math.random() * rect.width
    const y = rect.top + Math.random() * rect.height
    const hits = document
      .elementsFromPoint(x, y)
      .filter((e) => e.hasAttribute('data-symmetry-group')).length
    maxHits = Math.max(maxHits, hits)
    if (hits >= 1) onRegion++
  }
  return { maxHits, onRegion, samples }
}

function smallestRegionPx(): { px: number; id: string } {
  const scale = view.el.getBoundingClientRect().width / 1000
  let min = Infinity
  let id = ''
  view.el.querySelectorAll('[data-symmetry-group]').forEach((node) => {
    const bb = (node as SVGGraphicsElement).getBBox()
    const d = Math.min(bb.width, bb.height)
    if (d < min) {
      min = d
      id = node.getAttribute('data-region-id') ?? ''
    }
  })
  return { px: min * scale, id }
}

function report(): void {
  const regions = view.el.querySelectorAll('[data-symmetry-group]').length
  const groups = new Set(
    [...view.el.querySelectorAll('[data-symmetry-group]')].map((n) =>
      n.getAttribute('data-symmetry-group'),
    ),
  ).size
  const overlap = overlapSpotCheck()
  const smallest = smallestRegionPx()

  readout.textContent = [
    `mandala        ${floral01.title} (${floral01.id})`,
    `symmetry       ${floral01.symmetryOrder}-fold`,
    `regions        ${regions}  ·  groups ${groups}`,
    `palette        ${floral01.palettes[0].name} (${pal.length} colors)`,
    ``,
    `AC overlap     max ${overlap.maxHits} region(s) / point` +
      `  ${overlap.maxHits <= 1 ? '✓ (≤1)' : '✗ OVERLAP'}` +
      `   [${overlap.onRegion}/${overlap.samples} on a region]`,
    `AC min region  ${smallest.px.toFixed(0)}px  (${smallest.id})` +
      `  ${smallest.px >= 40 ? '✓ (≥40)' : '✗ too small'}`,
  ].join('\n')

  console.log('[mandala] overlap', overlap, 'smallest', smallest)
}

// Two rAFs so layout + the 600px box are settled before getBBox / hit-testing.
requestAnimationFrame(() => requestAnimationFrame(report))
