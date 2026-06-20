/**
 * types.ts — the mandala data model (the MANDALA-SPEC contract, in TypeScript).
 *
 * Two halves:
 *   - The *authoring* shape: a `WedgeMotif` (one 45°/360°÷N sector of closed
 *     paths) that `generateMandala.pure.ts` rotate-copies ×N into a spec SVG.
 *   - The *logical* shape: `Region` / `SymmetryGroup` describe the fillable units
 *     the rest of the app reasons about (dwell is keyed by `data-symmetry-group`).
 *
 * Part of `engine/` — imports nothing from React or the DOM. Pure data types.
 * See MANDALA-SPEC.md for the rules these encode.
 */

/** A curated, harmonious set of colors (MANDALA-SPEC §7). */
export interface Palette {
  name: string
  colors: string[]
}

/**
 * One closed, fillable shape inside the authored wedge, in viewBox user units
 * (canvas is 1000×1000, centered on 500,500). `d` is an SVG path data string
 * (must start `M`, end `Z`, no overlaps with siblings or rotated copies).
 */
export interface WedgeShape {
  /** Base id, unique within the wedge. The generator suffixes `-w{k}` per copy. */
  id: string
  /** `data-symmetry-group` — all N rotated copies of this shape fill together. */
  groupId: string
  /** SVG path data in viewBox coordinates. */
  d: string
}

/**
 * The center motif, emitted exactly once (its own symmetry group of 1). Either a
 * `<circle>` (the bullseye case MANDALA-SPEC §3 calls out) or a closed `<path>`.
 */
export interface WedgeCenter {
  groupId: string
  circle?: { cx: number; cy: number; r: number }
  d?: string
}

/** One authored sector: the shapes that get rotate-copied, plus the center. */
export interface WedgeMotif {
  shapes: WedgeShape[]
  center?: WedgeCenter
}

/** A single fillable region in the generated mandala. */
export interface Region {
  /** Globally unique `data-region-id`. */
  regionId: string
  /** Its `data-symmetry-group`. */
  group: string
  /** Which wedge copy (0..N-1), or `null` for the center. */
  wedge: number | null
}

/** All N radial siblings that fill together when mirroring is ON. */
export interface SymmetryGroup {
  id: string
  regionIds: string[]
}

/**
 * A ready-to-mount mandala: the generated SVG string plus its metadata. This is
 * what the web adapter mounts and what the React shell reads (M5).
 */
export interface MandalaDoc {
  id: string
  title: string
  symmetryOrder: number
  /** Uncolored "paper" fill — also what the eraser resets a region to. */
  paper: string
  palettes: Palette[]
  /** Spec-compliant SVG, produced by `generate()`. */
  svg: string
}
