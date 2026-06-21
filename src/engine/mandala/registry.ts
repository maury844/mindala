/**
 * registry.ts — the list of shipped mandalas the picker offers.
 *
 * Order here is the order they appear in the UI, and the first entry is the
 * default the shell mounts on load. Each entry is a ready `MandalaDoc` (generated
 * geometry + palette), so adding a mandala is one import + one array entry — no
 * app or hook changes (MANDALA-SPEC §9: "drops straight into the app").
 *
 * Part of `engine/` — no DOM, no React.
 */

import { floral01 } from './floral01'
import { compass08 } from './compass08'
import type { MandalaDoc } from './types'

export const MANDALAS: readonly MandalaDoc[] = [floral01, compass08]
