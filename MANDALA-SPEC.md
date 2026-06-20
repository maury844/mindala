# Mandala Asset Spec — "what our mandalas must have"

> The contract every mandala asset follows so the app can: (a) hit-test which
> region the cursor is over, (b) fill it, (c) mirror the fill across radial
> siblings, and (d) optionally guide coloring (Mode 2). **Both hand-authored
> SVGs and any future procedural generator MUST emit this contract.**

_Companion to [DESIGN.md](DESIGN.md). Created 2026-06-20._

---

## 1. File & canvas
- **One SVG file per mandala.** Self-contained (inline paths) — no external refs, no raster `<image>`.
- **Square `viewBox`, recommended `0 0 1000 1000`.** Design centered on **(500, 500)**.
- Don't hard-code `width`/`height`; rely on `viewBox` so CSS can scale it crisply.

## 2. Radial symmetry
- Each mandala declares a **symmetry order N** (e.g. 6, 8, 12, 16) = number of identical wedges around the center.
- Geometrically the design = **one wedge (360/N°) rotate-copied N times** about (500,500).
- Reflective symmetry inside a wedge is allowed but not required.

## 3. Regions — the fillable units (the core of the spec)
Every fillable area is a **closed shape**, normally a `<path>` (use `<circle>`/`<ellipse>` for the center bullseye). Each MUST carry:

| Attribute | Purpose |
|-----------|---------|
| `data-region-id` | Globally unique id in the file, e.g. `r-ring2-petal3-w5`. Identifies the exact shape. |
| `data-symmetry-group` | Shared by all N radial siblings that fill **together**. Same group → fill simultaneously when mirroring is ON. The center is its own group of 1. |

**Hard rules (these make hit-testing & filling unambiguous):**
- Paths MUST be **closed** (`Z` / start == end).
- Fillable regions MUST **tile without overlap**: any screen point lies in **exactly one** fillable region (or none = background). No overlapping fills.
- Avoid self-intersecting paths; keep `fill-rule` consistent so point-in-fill is reliable.

**Granularity guideline (important for feel):** a `data-symmetry-group` should be **one small motif repeated at the N rotational positions** (e.g. a single petal + its N siblings) — **not** an entire concentric ring fused into one fill. Whole-ring grouping (as the throwaway spike did) fills too much at once and feels aggressive; granular motif-groups are both more satisfying *and* more controllable. A region's siblings = the **same shape at each of the N wedge rotations**.

## 4. Non-fillable elements
- **Decorative linework** that must NOT be colorable → mark `data-role="decor"` and set `pointer-events: none` so it never intercepts the cursor. (Or put it all in a top layer `<g data-layer="decor" pointer-events="none">`.)
- **Coloring-book outline:** either give each region its own `stroke` (simplest), or draw heavier linework as a separate decor layer on top.
- **Background** (area outside the art) → a `<rect data-role="background">`. **Default: NOT fillable** (`pointer-events: none`) so cursor drift off the mandala doesn't paint. Make it fillable only if a specific mandala wants it.

## 5. Uncolored vs colored state
- Regions start **uncolored**: a neutral "paper" fill (e.g. `#f4efe6`) or light tint, with a visible stroke, so the linework reads before coloring.
- The app sets a region's `fill` to a palette color on dwell — **colors are applied at runtime, not baked into the SVG.**
- Exception: Mode-2 guided **suggested** colors live in `meta.json` (§7), not in the SVG fills.

## 6. Region size / dwell ergonomics
- A head-driven cursor must be able to **park inside** the smallest fillable region.
- Guideline: smallest fillable region ≈ contains a **40px-diameter circle** at default render size. Anything finer should be `decor`, not fillable.
- Fewer, chunkier regions = better hands-free UX. **Target ~40–200 fillable regions** per mandala for the A build.

## 7. Metadata sidecar — `meta.json` (next to the SVG)
```json
{
  "id": "lotus-01",
  "title": "Lotus",
  "symmetryOrder": 8,
  "palettes": [
    { "name": "Sunset", "colors": ["#f6bd60", "#f28482", "#e76f51", "#84a98c", "#3d405b"] },
    { "name": "Ocean",  "colors": ["#caf0f8", "#90e0ef", "#00b4d8", "#0077b6", "#03045e"] }
  ],
  "guided": {                                   // OPTIONAL — enables Mode 2 for this mandala
    "paletteName": "Sunset",
    "regionColors": { "ring1-a": "#f6bd60", "ring2-petal": "#e76f51" },
    "order": ["ring1-a", "ring2-petal", "ring3-tip"]
  },
  "author": "you",
  "license": "CC0"
}
```
- **At least one palette required** — curated 5–6 harmonious colors (DESIGN decision #7) so results never look garish.
- `guided` is optional; if absent, Mode-2/paint-by-numbers is simply disabled for that mandala.
- `guided.regionColors` and `guided.order` are keyed by **`data-symmetry-group`** (not `region-id`) so one entry covers all siblings.

## 8. Recommended internal structure
```svg
<svg viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg">
  <rect data-role="background" x="0" y="0" width="1000" height="1000"
        fill="#0d0f14" pointer-events="none"/>

  <g data-layer="regions" stroke="#222" stroke-width="2" fill="#f4efe6">
    <g data-wedge="0">
      <path data-region-id="r-ring1-a-w0" data-symmetry-group="ring1-a" d="..."/>
      <path data-region-id="r-ring2-p-w0" data-symmetry-group="ring2-p" d="..."/>
    </g>
    <g data-wedge="1">
      <path data-region-id="r-ring1-a-w1" data-symmetry-group="ring1-a" d="..."/>
      <path data-region-id="r-ring2-p-w1" data-symmetry-group="ring2-p" d="..."/>
    </g>
    <!-- ... wedges 2..N-1 ... -->
    <circle data-region-id="r-center" data-symmetry-group="center" cx="500" cy="500" r="40"/>
  </g>

  <g data-layer="decor" pointer-events="none" fill="none" stroke="#222">
    <!-- fine linework, not colorable -->
  </g>
</svg>
```
- `data-wedge` grouping is **organizational only** — the authoritative sibling link is `data-symmetry-group`.

## 9. For the future procedural generator (deferred B-item)
A generator satisfies this spec by:
1. Generate **one wedge** as a set of closed, non-overlapping paths.
2. Assign each base region a `data-symmetry-group`.
3. **Rotate-copy** the wedge N times about (500,500); each copy inherits its base region's group and gets a unique `data-region-id`.
4. Emit `meta.json` with a generated harmonious palette.

Produce this contract and the output drops straight into the app — no app changes needed.

## 10. Authoring checklist (hand-made)
- [ ] Square `viewBox 0 0 1000 1000`, centered on (500,500).
- [ ] Every fillable path **closed**, **non-overlapping**, has `data-region-id` + `data-symmetry-group`.
- [ ] Radial siblings across wedges **share** `data-symmetry-group`.
- [ ] Neutral default fill + visible stroke (uncolored state reads).
- [ ] Decorative linework marked `decor` / `pointer-events:none`.
- [ ] Background non-fillable unless intended.
- [ ] No fillable region smaller than the ~40px dwell target.
- [ ] `meta.json` present with ≥1 curated palette (+ optional `guided`).
