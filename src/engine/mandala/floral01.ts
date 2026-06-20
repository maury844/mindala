/**
 * floral01.ts — the first shipped mandala (DESIGN #11): the authored floral
 * wedge rotate-copied ×8, bundled with its palette metadata into a `MandalaDoc`.
 *
 * `meta.json` is the MANDALA-SPEC §7 sidecar (the single source of truth for the
 * palette / title / symmetry order — exactly what a future external generator
 * would emit). Here we combine it with the generated geometry so the React shell
 * (M5) can mount one ready object.
 *
 * Part of `engine/` — no DOM, no React.
 */

import meta from '../../assets/mandalas/floral-01/meta.json'
import { floralMotif } from './floralWedge'
import { buildMandalaDoc } from './generateMandala.pure'
import type { MandalaDoc } from './types'

export const floral01: MandalaDoc = buildMandalaDoc(meta, floralMotif)
