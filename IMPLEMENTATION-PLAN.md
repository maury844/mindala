# IMPLEMENTATION PLAN — Phase A (head-controlled floral mandala coloring)

## Progress tracker (updated 2026-06-20)
- ✅ M0 — Scaffold & tooling (done): Vite React TS app, tooling, config constants, and engine boundary are in place.
- ✅ M1 — Engine: face tracking (done): MediaPipe FaceTracker, pure pose extraction, unit tests, and `/tracking.html` dev harness are in place.
- ✅ M2 — Engine: velocity cursor (done): `VelocityCursor` (EMA → neutral → deadzone → expo → integrate → clamp) + exported pure `shape()`, 13 Vitest cursor tests.
- ✅ M3 — Engine: mandala model + generator + first asset (done): `types`, pure `generate()`/`describeRegions()`, the authored floral 8-fold wedge, `floral01` doc + `meta.json`, and the web-only `webView` adapter. 18 new Vitest tests; rendered ACs (8-fold/floral, no overlap, ≥40px regions) verified in-browser via `/mandala.html`.
- ✅ M4 — Engine: dwell controller (done): pure `dwellController.pure.ts` (`DwellController` class — must-stop gate, region-keyed progress, decay-on-leave, disarm-after-commit) emitting `selectColor`/`fill`/`erase` events; the canonical `DwellTarget` type now lives here and `webView` re-exports it. 15 new Vitest tests cover every AC.
- ⏳ M5 — React shell (pending)
- ⏳ M6 — Integration polish & verify (pending)

> **Audience: a dev agent picking this up cold.** Execute milestones in order;
> each task has a Goal, technical Approach, Files, and **Acceptance Criteria (AC)**
> you can verify. Do not change locked decisions — see [DESIGN.md](DESIGN.md). All
> tuned constants come from [DISCOVERY.md](DISCOVERY.md) §4. Asset rules from
> [MANDALA-SPEC.md](MANDALA-SPEC.md). Reference mechanics: `spike/index.html`,
> `spike/dwell.html`.

_Created 2026-06-20. Scope: Phase A (the "ridiculous toy", built clean for B)._

---

## How to use this doc
- Start with the **Progress tracker** above to see the current handoff state before reading detailed milestone sections.
- When you complete or partially complete a milestone, update the tracker first, then add or adjust the milestone status note below.
- Work **M0 → M6 in order**; later milestones depend on earlier ones.
- A task is **Done** only when **every AC passes** and the global Definition of Done holds.
- Sizes: **S** ≈ <½ day, **M** ≈ ~1 day, **L** ≈ ~2 days (rough, for sequencing only).
- If an AC is ambiguous or a locked decision seems wrong, **stop and flag it** rather than guessing — the design was deliberately grilled.

## Global Definition of Done
1. `npm run build` and `npm run typecheck` pass with **zero errors** (TS strict).
2. `npm run lint` clean. `npm test` green.
3. **No file under `src/engine/` imports React** (enforced by lint rule — M0).
4. All magic numbers for feel live in `engine/config.ts`, not inline.
5. Feature verified in a real browser (camera), not just unit tests, where AC says so.

## Tech & dependencies
- **Vite** (react-ts template) + **React 18+** + **TypeScript** (strict).
- **`@mediapipe/tasks-vision`** (`^0.10`) — FaceLandmarker.
- **Vitest** + **@testing-library** (engine unit tests; jsdom env for state machines).
- **ESLint + Prettier**. Add `eslint-plugin-import` for the engine-boundary rule.
- Node 18+. Package manager: npm (lockfile committed).

## Architecture rules (do not violate)
- **`src/engine/` is React-free and, where marked `*.pure.ts`, DOM-free.** Portability guarantee for the mobile pivot.
- **Two layers in the mandala code:**
  - *Portable (pure):* dwell **state machine** (timing, must-stop gate, decay), pose math, cursor integration. Unit-testable, no DOM.
  - *Web adapter:* `elementFromPoint` hit-testing + `setAttribute('fill', …)`. May touch the DOM; isolated in clearly web-only modules.
- React renders the shell and reads engine state through **one** hook (`useEngine`). No engine logic in components.
- Mandala assets obey MANDALA-SPEC; **dwell is keyed by `data-symmetry-group`**.

## Non-goals this phase (explicitly out of scope)
Onboarding polish / calibration overlay, accounts/saving, sharing/export, sound, B-phase visual juice (glow/particles/animated background), parametric mandala generator (we only rotate-copy ONE authored wedge), hand-gesture control, mobile-native, multi-mandala library UI (ship with one). The mouth-open clutch is **reserved**, not built.

---

## M0 — Scaffold & tooling  ·  size S
**Status:** Done 2026-06-20. Validation: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` passed.

**Goal:** a running Vite React-TS app with the engine boundary enforced and constants centralized.

**Approach:** `npm create vite@latest . -- --template react-ts`. Add deps. Create folder structure from DISCOVERY §6. Add ESLint rule banning React imports in `engine/` (`import/no-restricted-paths` or a `no-restricted-imports` override scoped to `src/engine/**`). Add Vitest. Create `engine/config.ts` with the DISCOVERY §4 constants as `as const`.

**Files:** `package.json`, `vite.config.ts`, `tsconfig*.json`, `.eslintrc.*`, `src/engine/config.ts`, `src/app/App.tsx`, folder skeleton.

**AC:**
- `npm run dev` serves a blank dark "stage" page on localhost.
- `npm run typecheck`, `lint`, `test` (0 tests ok) all pass.
- A deliberate `import React from 'react'` inside any `engine/` file **fails lint**.
- `engine/config.ts` exports every constant from DISCOVERY §4 with the exact values; no other file redefines them.

## M1 — Engine: face tracking  ·  size M  ·  depends M0
**Status:** Done 2026-06-20. Added `FaceTracker`, pure `matToEuler` extraction, 7 Vitest pose tests, and `/tracking.html` webcam debug harness.

**Goal:** per-frame head pose + blendshapes from the webcam, framework-free.

**Approach:** `engine/tracking/faceTracker.ts` wraps `FaceLandmarker` (`outputFacialTransformationMatrixes: true`, `outputFaceBlendshapes: true`, `runningMode: 'VIDEO'`, `numFaces: 1`, GPU delegate; model + wasm URLs as constants, overridable). `engine/tracking/pose.pure.ts` = `matToEuler(data: Float32Array)` using the **column-major / THREE 'YXZ'** decomposition from DISCOVERY §4. Tracker exposes `detect(video, nowMs) → { hasFace, yaw, pitch, roll, jawOpen }`; only calls `detectForVideo` when `video.currentTime` advanced.

**Files:** `engine/tracking/faceTracker.ts`, `engine/tracking/pose.pure.ts`, tests.

**AC:**
- `matToEuler` has unit tests: identity matrix → ~0/0/0; a known yaw-rotation matrix → expected yaw within 0.5°.
- A throwaway dev route renders the webcam and logs `{yaw,pitch,jawOpen}` updating at ≥15 fps with a face present.
- `pose.pure.ts` imports nothing (no DOM, no React, no mediapipe).

## M2 — Engine: velocity cursor  ·  size M  ·  depends M1
**Status:** Done 2026-06-20. Added `engine/cursor/velocityCursor.ts` (`VelocityCursor` class + exported pure `shape()`) and 13 Vitest tests. All §4 cursor constants read from `config.ts`; no React/DOM imports. `typecheck`/`lint`/`test`/`build` green.

**Goal:** convert pose → screen cursor with the validated feel.

**Approach:** `engine/cursor/velocityCursor.ts`: EMA smoothing (`SMOOTH`), `neutral` capture + `recenter()`, dead zone (`DEADZONE`), expo shaping (`EXPO`, `MAX_ANGLE`, `SENS`), `INVERT_X/Y`, integrate to position clamped to viewport. `update(rawYaw, rawPitch, dt, viewport) → { x, y, speed }`. Keep the `shape(delta)` function pure and exported for tests.

**Files:** `engine/cursor/velocityCursor.ts`, tests.

**AC:**
- Unit tests: `shape(delta=DEADZONE)` ≈ 0; `shape(MAX_ANGLE+DEADZONE)` ≈ `SENS`; monotonic increasing between; sign respects `INVERT_*`.
- Integration test: constant raw angle for 1s integrates position by ≈ `shape(delta)` px (±2%), clamped at viewport edges.
- `speed` returned = `hypot(vx, vy)`.
- First valid frame after construction or `recenter()` sets neutral and yields ~zero velocity.

## M3 — Engine: mandala model + generator + first asset  ·  size L  ·  depends M0
**Status:** Done 2026-06-20. `engine/mandala/`: `types.ts`, pure `generateMandala.pure.ts` (`generate` + `describeRegions` + `buildMandalaDoc`), the authored `floralWedge.ts` (4 motif bands — round petal · heart · pointed leaf · outer crown — + center disc, geometry computed from named radii/half-widths so the tiling is checkable), `floral01.ts` + `assets/mandalas/floral-01/meta.json` (9-color "Bloom" palette), and web-only `webView.ts` (`mountMandala`/`resolveTargetAt`/`fillGroup`/`eraseGroup`). 18 new tests. Rendered ACs verified at `/mandala.html`: no region overlap (≤1 hit/point), smallest inscribed region ≥45px @600 (≥40 target), visibly 8-fold + floral. `typecheck`/`lint`/`test`/`build` green; engine boundary clean. Note: tiling is guaranteed by construction (disjoint radial bands, each motif within ±22.5°), so gaps between motifs read as background — overlap can't occur.

**Goal:** a spec-compliant floral 8-fold mandala produced by rotate-copying one authored wedge.

**Approach:**
- `engine/mandala/types.ts`: `Region`, `SymmetryGroup`, `Palette`, `MandalaDoc`, `WedgeShape { id, groupId, d }`, `WedgeMotif { shapes: WedgeShape[], center?: {d|circle, groupId} }`.
- `engine/mandala/generateMandala.pure.ts`: `generate(motif, N) → svgString`. ViewBox `0 0 1000 1000`, center (500,500). For `k in 0..N-1`, emit `<g transform="rotate(${k*360/N} 500 500)">` containing the motif's shapes, each `<path data-region-id="${shape.id}-w${k}" data-symmetry-group="${shape.groupId}" .../>`. Emit the center shape once (own group). Apply default `fill` = paper, visible stroke.
- **Author the floral wedge** (`engine/mandala/assets/floralWedge.ts`): hand-author `d` strings in wedge-local coords for a 45° sector (N=8), ~4 motif shapes (center-petal, heart, pointed-petal, outer-scroll) + center disc, matching the reference style. Shapes tile without overlap within and across wedge boundaries.
- `engine/mandala/floral01.ts` + `assets/mandalas/floral-01/meta.json`: the 9-color palette (DISCOVERY §8) + title/symmetryOrder.
- `engine/mandala/webView.ts` (web-only): mount svgString into a container, `resolveTargetAt(x,y)` via `document.elementFromPoint`, `fillGroup(group, color)`, `eraseGroup(group)`.

**AC:**
- Generated SVG **validates against MANDALA-SPEC**: every fillable `<path>` has both `data-region-id` (unique) and `data-symmetry-group`; siblings across the 8 wedges share a group; groups = motif shapes (+center); paper default fill + stroke.
- Rendered, the mandala is **visibly 8-fold symmetric** and reads as floral.
- No two fillable regions overlap at any sampled point (spot-check: 200 random points each map to ≤1 fillable path).
- `generate()` is pure (no DOM); `webView.ts` contains all DOM access.
- Smallest fillable region encloses a ≥40px circle at 600px render size.

## M4 — Engine: dwell controller (pure state machine)  ·  size M  ·  depends M2, M3
**Status:** Done 2026-06-20. Added `engine/mandala/dwellController.pure.ts`: the `DwellController` class ports the `spike/dwell.html` state machine (must-stop gate via `MUST_STOP`, region/swatch progress keyed by `target.key`, decay-on-leave via `DECAY`, disarm-after-commit re-arm latch) as a pure, DOM-free integrator driven by `update({ target, speed, dt, activeColor })`. On completion it returns one event: `selectColor` (any swatch; eraser reports paper), `fill` (region + active color), or `erase` (region while paper/eraser active — paper passed via constructor `{ paper }`, keeping the shell's active color the single source of truth). Reset mode is decay-only (the locked `RESET_MODE`; the `as const` literal also makes an `instant` branch a type error, so the spike's experimental mode is intentionally not shipped). The canonical `DwellTarget` discriminated union now lives in this file; `webView.ts` imports it and re-exports `Target` as an alias. 15 new Vitest tests cover every AC; `typecheck`/`lint`/`test`/`build` green, engine boundary clean. Note: the AC line "eraser target → erase" is realized as documented in the approach text — the eraser swatch emits `selectColor(paper)`, and a subsequent region dwell while paper is active emits `erase` (an `erase` event needs a `group`, which the eraser swatch has none of, so it cannot be emitted at the swatch itself).

**Goal:** the validated dwell loop as a DOM-free state machine.

**Approach:** `engine/mandala/dwellController.pure.ts`. Input each tick: `{ targetKey, targetMeta, speed, dt, activeColor }`. Logic per DISCOVERY §4 / `dwell.html`: must-stop gate (accumulate only when `speed < MUST_STOP`), region-based progress keyed by `targetKey`, **decay** reset (`DECAY`) on leaving, `disarm` after commit until target left. On completion, return an **event**: `{ kind:'fill', group, color }`, `{ kind:'erase', group }`, or `{ kind:'selectColor', color }` (swatch). Output: `{ progress, charging, event? }`. The controller never touches the DOM; the shell maps events to `webView.fillGroup/eraseGroup` and palette state.

**Files:** `engine/mandala/dwellController.pure.ts`, tests.

**AC:**
- Unit tests (driven by synthetic ticks):
  - With `speed > MUST_STOP`, progress never increases (moving = no paint).
  - With `speed < MUST_STOP` over the same target for `DWELL_TIME`, exactly one completion event fires.
  - Leaving the target drains progress at `DECAY` (decay mode), not instant.
  - After a fill, re-arm requires leaving the target (no repeat-fill while parked).
  - Swatch target → `selectColor`; eraser target → `erase`; region target → `fill` with current `activeColor`.
- Controller file imports nothing DOM/React.

## M5 — React shell  ·  size L  ·  depends M1–M4
**Goal:** the full app — camera gate, render loop, cursor, palette dock, coloring.

**Approach:**
- `app/hooks/useEngine.ts`: owns the **single rAF loop** → `faceTracker.detect` → `velocityCursor.update` → `webView.resolveTargetAt` → `dwellController.update` → apply events. Exposes `{ cursor, progress, charging, hasFace, fps, activeColor, setActiveColor }` to React. Cleans up on unmount.
- `app/components/Stage.tsx`: mounts the generated mandala SVG (via `webView`) + `<Cursor/>`.
- `app/components/Cursor.tsx`: the dot + radial progress ring (conic-gradient), **`pointer-events:none`**, "go" state when `charging`.
- `app/components/PaletteDock.tsx`: 9 swatches + eraser, each `data-swatch`; active swatch highlighted; hovered swatch highlighted; dwell-selectable (same loop).
- `app/components/CameraGate.tsx`: requests `getUserMedia`; handles denial with a retry message; shows a loading state while the model downloads.
- Dev overlay (toggle): fps / face / over / progress readouts (port from spikes).

**AC (verified in a real browser):**
- Permission prompt appears; on allow, model loads, loop starts; on deny, a clear retry message (no crash).
- End-to-end: **steer → relax to neutral → region fills**, mirroring across all 8 wedges; **dwell a swatch → active color changes**; **dwell eraser → region returns to paper**; re-dwell a filled region recolors it.
- Cursor + ring never block hit-testing (you can always fill the region under them).
- Loop runs at ≥20 fps on the dev machine; no memory growth over 2 min (stream/landmarker disposed on unmount).
- Engine boundary lint still clean.

## M6 — Integration polish & verify  ·  size S  ·  depends M5
**Goal:** feel-parity with the spikes; ship-ready Phase-A toy.

**Approach:** confirm constants match DISCOVERY §4; add a "Recenter" affordance (button + spacebar) and an on-screen first-use hint ("turn your head to move · relax to paint"); handle face-lost (freeze cursor, show subtle "no face" hint); basic responsive centering of the mandala.

**AC:**
- A reviewer runs the **manual verify checklist** (below) and all pass.
- Recenter works (button + spacebar); face-loss doesn't move or fill.
- README documents run/build and the camera/secure-context requirement.

---

## Testing strategy
- **Unit (Vitest):** all `*.pure.ts` — `matToEuler`, `shape`, cursor integration, dwell state machine. These encode the validated behavior; treat them as regression guards.
- **Manual browser verify (feel):** the only judge of "feels good" is a human (per the spike philosophy). Use the checklist:

### Manual verify checklist (feel parity)
1. Steer cursor to all four corners + center, **stop each**, within ~10s, no rage.
2. Head at rest → cursor dead still (no creep/jitter).
3. Park on a petal, relax → it fills, mirrored ×8; travel through petals never fills.
4. Dwell a swatch → color switches; dwell eraser → region resets.
5. Re-dwell a filled region with a new color → recolors.
6. Recenter (button/space) re-zeros neutral.
7. ≥20 fps; works in normal room lighting.

## Risks & mitigations
- **Authoring a pretty + tiling floral wedge is the hardest hand-task** (M3). Mitigate: start from simple geometric-floral shapes that provably tile, refine aesthetics second. Keep shapes chunky (dwell ergonomics > intricacy for N=8).
- **Pose sign/convention drift** → keep `INVERT_X/Y` configurable; verify against the spikes.
- **Model load latency** (~3MB) → show a loading state; consider self-hosting model+wasm later (not this phase).
- **Region overlap from rotate-copy at wedge seams** → author the wedge so shapes stay within/seam-match the sector; spot-check AC in M3.

## Phase A is complete when
The manual verify checklist passes end-to-end on one floral 8-fold mandala with the 9-color palette + eraser, the build is green, and the engine boundary holds. Then resume the **deferred app-shell grilling** (DESIGN §7): onboarding, edge cases, B-phase visuals, sharing, mobile.
