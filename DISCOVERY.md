# DISCOVERY — start here

> **Read this first.** It orients a fresh session: what this project is, what's
> already decided & proven, what to load before implementing, the planned
> architecture, the build order, and the gotchas that will bite you.

_Project: `C:\Projects\draw`. Last updated: 2026-06-20._

---

## 0. What this is (one paragraph)
A **webapp where you color mandalas hands-free, moving the cursor with your head** via webcam. Turn/nod your head to steer a velocity-controlled cursor; relax to neutral so it stops over a region; it dwell-fills with the active color and **mirrors across the mandala's symmetry**. Pick colors from an edge dock with the same dwell verb. Goal posture: **(A) a ridiculous, shareable toy, architected so it can become (B) a polished portfolio piece.** Webapp first; mobile-native and hand-gesture control are later pivots.

## 1. Status (2026-06-20)
- **Planning + de-risking complete.** The two riskiest mechanics are **validated on real hardware** via throwaway spikes.
- **The real app is built.** M0–M5 are done and M6 polish is mostly in: `npm run dev` → `/` boots the camera gate → 8-fold floral mandala + palette dock + head-driven cursor. Engine is React-free and unit-tested (53 tests); shell wiring is in `src/app/`.
- **Next action: a human runs the M6 manual verify checklist at a real webcam** (steer→park→fill→mirror, swatch/eraser dwell, recenter, ≥20 fps) — the only Phase-A gate left, since headless checks all pass but feel needs hardware. See [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) M5/M6.
- This was a `/grill-me` design session; decisions are logged in [DESIGN.md](DESIGN.md).

## 2. Document map — what to load, in order
1. **DISCOVERY.md** (this file) — orientation + implementation plan + gotchas.
2. **[IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md)** — the executable build spec: milestones M0–M6, each with goal, technical approach, files, and **acceptance criteria**. A dev agent works this top to bottom.
3. **[DESIGN.md](DESIGN.md)** — the decision log. §2 = locked decisions table (11 rows), §4 = tech stack, §5 = core pipeline, §6 = spike results + validated tuning, §7 = deferred/open questions.
4. **[MANDALA-SPEC.md](MANDALA-SPEC.md)** — the asset contract every mandala SVG must follow (regions, symmetry groups, palette sidecar, dwell ergonomics). Required reading before building the generator or any mandala.
5. **The two spikes are the reference implementation of the validated mechanics — read their code:**
   - `spike/index.html` — head→cursor velocity pipeline (pose extraction, dead zone, expo, smoothing, recenter).
   - `spike/dwell.html` — the full coloring loop: SVG regions, `elementFromPoint` hit-testing, region-based dwell, must-stop gate, decay reset, mirrored group-fill, palette dock + eraser.

## 3. What the spikes PROVED (don't re-litigate these)
- ✅ Head-driven **velocity** cursor (yaw→X, pitch→Y) feels good and controllable.
- ✅ **Dwell-to-fill** with a **must-stop gate** ("steer → relax head to neutral → it paints") feels good; travel never misfires.
- ✅ **Mirrored fill** (one dwell lights all rotational siblings) is satisfying — keep ON by default, make it a toggle later.
- ✅ Axis signs, smoothing, dwell timing, reset behavior all dialed in (constants below).

## 4. Validated constants — single source of truth (put these in `engine/config.ts`)
**Cursor pipeline** (`pose → (angle−neutral) → dead zone → expo → velocity → integrate`):
| Const | Value | Meaning |
|------|-------|---------|
| `SENS` | **1200** px/s | top cursor speed at full tilt |
| `DEADZONE` | **3°** | head angle within this → zero velocity |
| `EXPO` | **1.7** | response curve exponent (small tilt = fine, big = fast) |
| `SMOOTH` | **0.6** | EMA factor; applied as `sm += (raw − sm) * (1 − SMOOTH)` |
| `MAX_ANGLE` | **22°** | angle that maps to full speed |
| `INVERT_X` | **true** | turn right → cursor right |
| `INVERT_Y` | **false** | nod down → cursor down |

**Dwell loop:**
| Const | Value | Meaning |
|------|-------|---------|
| `DWELL_TIME` | **1.2 s** | park duration to complete a fill |
| `MUST_STOP` | **60 px/s** | only accumulate dwell while cursor speed < this (≈ head near neutral) |
| `RESET_MODE` | **decay** | on leaving a region, progress drains (not instant snap) |
| `DECAY` | **1.8 /s** | drain rate for decay reset |
| `JAW_THRESH` | **0.5** + brief hold | mouth-open clutch threshold (RESERVED feature; talking hits ~0.4) |

**Pose extraction:** MediaPipe `facialTransformationMatrixes[0].data` is a **column-major 4×4**. Decompose with the THREE.js **'YXZ'** convention → `pitch = asin(−m23)`, `yaw = atan2(m13, m33)`, `roll = atan2(m21, m22)` (indices into the column-major array; see `matToEuler` in either spike).

## 5. Tech stack (decided)
- **Head tracking:** MediaPipe **Face Landmarker** (`@mediapipe/tasks-vision`), in-browser (WASM+WebGL), fully on-device. Outputs: `facialTransformationMatrixes` (pose=joystick), `faceBlendshapes` (`jawOpen` clutch — reserved), 478 landmarks.
- **Framework:** **React + Vite + TypeScript.** Hard rule: the **engine is React-free** (see §6).
- **Rendering:** **SVG** — paths = regions; `document.elementFromPoint` for free hit-testing; set `fill` to color. Optional canvas/WebGL overlay for B-phase "juice."
- **Hosting:** any static host over **HTTPS** (camera needs a secure context). Decide at deploy.

## 6. Planned architecture (proposed — refine as you build)
**Golden rule: `engine/` imports nothing from React.** React only renders the shell and reads engine state through one thin hook. This keeps the real-time core testable and portable to a future Svelte / React-Native shell.

```
src/
  engine/                      # ZERO React imports — pure TS, portable
    config.ts                  # all §4 constants
    tracking/
      faceTracker.ts           # FaceLandmarker setup + per-frame detect (pose, blendshapes)
      pose.ts                  # matToEuler (column-major → yaw/pitch/roll, YXZ)
    cursor/
      velocityCursor.ts        # deadzone→expo→velocity→integrate; recenter(); speed
    mandala/
      types.ts                 # Region, SymmetryGroup, MandalaDoc, Palette, GuidedMap
      generateMandala.ts       # author wedge motif + rotate-copy ×N → spec SVG string
      loadMandala.ts           # parse SVG + meta.json → MandalaDoc
      dwellController.ts       # region-based dwell, must-stop gate, decay, commit/erase, mirror-fill
  app/                         # React shell
    App.tsx
    hooks/useEngine.ts         # rAF loop: tracker→cursor→dwell; exposes state to React
    components/
      Stage.tsx                # renders mandala SVG + Cursor + dwell ring
      PaletteDock.tsx          # 9 swatches + eraser (dwell-selectable)
      Cursor.tsx               # the dot + radial progress ring (pointer-events:none!)
  assets/mandalas/
    floral-01/art.svg          # generated, spec-compliant
    floral-01/meta.json        # palette + (optional) guided map
```

## 7. Build order (implementation roadmap)
> Full task-level detail with **acceptance criteria** is in **[IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md)** (milestones M0–M6). This is the summary.

1. **Scaffold** Vite `react-ts`. Add `@mediapipe/tasks-vision`. → M0
2. **`engine/config.ts`** — the §4 constants.
3. **`engine/tracking/`** — port `faceTracker` + `pose.matToEuler` from the spikes.
4. **`engine/cursor/velocityCursor.ts`** — port the velocity pipeline + `recenter()` + `speed`.
5. **`engine/mandala/`** — `types`, then `generateMandala` (author the floral wedge as tagged closed paths, rotate-copy ×8), then `dwellController` (port dwell logic from `dwell.html`, keyed by `data-symmetry-group`).
6. **First asset** — generate `floral-01/art.svg` + write `meta.json` (the 9-color palette).
7. **React shell** — `useEngine` hook drives the rAF loop; `Stage`/`Cursor`/`PaletteDock` render. Camera-permission gate in front.
8. **Verify in a real browser** (use the `verify`/`run` flow): steer, park, fill, mirror, switch color, erase.
9. **Resume deferred grilling** (DESIGN §7): onboarding/permission UX, edge cases, visual bar for B, sharing, mobile.

## 8. First mandala spec (the build target)
- **Floral, 8-fold** (N=8). Reference: a coloringbunny floral coloring page (style only — DO NOT trace; author clean paths).
- ~5 concentric motif bands → ~5 symmetry groups: **center flower → ring of hearts → pointed petals → outer scrollwork** (+ center disc).
- **Palette (9 + erase):** pinks `#f9b4cb` `#ec7396` `#c84e78` · oranges `#f7b267` `#f4904f` `#e1672e` · greens `#a8cf9f` `#6aa873` `#2f7d5b` · eraser = paper `#f4efe6`.
- Symmetry groups must be **granular motifs per rotational position, NOT whole rings** (whole-ring fill felt aggressive). Min fillable region ≈ 40px for dwell.

## 9. Caveats & gotchas (these will bite you)
- **Camera = secure context only.** `localhost` (Vite dev) and HTTPS work; `file://` does not.
- **`elementFromPoint` needs the cursor out of the way.** The dot **and** the dwell ring must be `pointer-events: none`, or hit-testing returns the cursor instead of the region.
- **Dwell is keyed by `data-symmetry-group`, not region-id** — so dwelling any sibling charges the whole mirror group, and the fill mirrors. (Renderer still decides whether to actually paint siblings — keep mirror a toggle.)
- **Must-stop + velocity control:** "stopped" means **head relaxed to neutral** (velocity≈0). To hold the cursor on a far region you must return your head to neutral; any sustained tilt = motion = no fill. This is the intended "park to paint" gesture, not a bug.
- **Pose matrix is column-major**; use the YXZ decomposition in §4. Don't assume row-major.
- **Mirror the video preview** (`scaleX(-1)`) for natural UX; it does **not** affect the matrix math (signs handled by `INVERT_X/Y`).
- **MediaPipe model is ~3MB** from `storage.googleapis.com` (first-load delay). Consider self-hosting the `.task` model + `/wasm` for perf/offline later.
- **`detectForVideo` needs strictly increasing timestamps** — only call it when `video.currentTime` changed; integrate the cursor every rAF regardless.
- **`jawOpen` ~0.4 while talking** → the reserved mouth-clutch needs threshold ≥0.5 + a hold. Not used in the A build (A uses dwell).
- **Keep `engine/` React-free.** It's the portability guarantee for the mobile pivot.

## 10. How to run the spikes
A static server is required (camera needs localhost/HTTPS):
```
python -m http.server 8000 --directory C:\Projects\draw\spike
```
- Cursor feel test → http://localhost:8000/index.html
- Dwell + reset test → http://localhost:8000/dwell.html
(Allow camera; first load downloads the model.)

## 11. Open / deferred (full list in DESIGN §7)
All remaining questions are **app-shell**, intentionally deferred until a real mandala is on screen: onboarding/permission flow, edge cases (no camera / bad light / multiple faces / leaving frame / weak hardware), visual bar for B (background, fill animation, glow, sound), sharing/export, mobile pivot, hosting.
