/**
 * compass08.ts — a second shipped mandala: the authored compass/snowflake wedge
 * rotate-copied ×8, bundled with its palette metadata into a `MandalaDoc`.
 *
 * Same shape as `floral01.ts`: `meta.json` is the MANDALA-SPEC §7 sidecar (single
 * source of truth for palette / title / symmetry order) and is combined here with
 * the generated geometry so the React shell can mount one ready object. Swap the
 * app to it with `useEngine(compass08)` in `App.tsx`.
 *
 * Part of `engine/` — no DOM, no React.
 */

import meta from '../../assets/mandalas/compass-08/meta.json'
import { compassMotif } from './compassWedge'
import { buildMandalaDoc } from './generateMandala.pure'
import type { MandalaDoc } from './types'

export const compass08: MandalaDoc = buildMandalaDoc(meta, compassMotif)
