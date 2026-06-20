# Head-Controlled Mandala Coloring — Design Notes

> A webapp where you color mandalas **hands-free**, moving the cursor with your
> head via webcam. Tilt/turn your head → cursor moves → dwell on a region → it
> fills with color. Ridiculous-fun first, built so it can become a polished
> portfolio piece.

_Last updated: 2026-06-20. This doc is the resume point for the grilling session._

---

## 1. Goal posture

- **Primary target: (A) a ridiculous, shareable toy.** Success = "lol try this," people flail their heads, share a clip.
- **Architected for: (B) a portfolio / craft piece.** Success = "it looks expensive, how'd you build that."
- **Explicitly NOT yet:** retention product, accounts/saving, or an accessibility tool. Those are scope traps for now.
- **Platform:** webapp first. Possible **mobile-native pivot later**. **Hand gestures** are a later pivot (head-control ships first).

---

## 2. Locked decisions

| # | Decision | Choice | Notes / rationale |
|---|----------|--------|-------------------|
| 1 | **Control law** | **Velocity / joystick** — head angle → cursor *speed* | Far more usable & less nausea than absolute mapping with a noisy webcam signal. Centered head = cursor still. |
| 2 | **Axes** | **Yaw → X**, **Pitch → Y** | "Nose as laser pointer." Yaw has comfortable range; independent axes combine into clean diagonals. **Roll** reserved as a "Confused Dog Mode" toggle later. |
| 3 | **Clutch (how paint happens)** | **Dwell-to-fill** — hover a region ~0.8s → it fills | Sidesteps the precision problem entirely. **The whole app is one verb: dwell.** **Mouth-open (`jawOpen`) clutch** reserved as an alt/ridiculous mode. |
| 4 | **App type** | **Coloring** (fill predefined closed regions), *not* freeform drawing | Tracing lines with a head-joystick = finger-painting in mittens. Filling regions is achievable & satisfying. |
| 5 | **Art source** | **Curated SVG library** of mandalas with closed, tagged regions | Start with **1 great mandala**, grow to ~5. **Procedural generation deferred** to a later script/service if it gets boring. |
| 6 | **Symmetry** ✅ | **Mirrored fills ON by default** — fill one region, all radial siblings fill | Validated in spike: satisfying ("the magic"). Keep ON + **toggle later** for finer control. Stored as data (region + color); renderer decides whether to mirror. **Granularity:** groups = a small motif per rotational position, *not* whole rings (see [MANDALA-SPEC.md](MANDALA-SPEC.md) §3). |
| 7 | **Color selection** | **Dwell-on-palette** (edge dock of swatches) + "shuffle palette" for replay | Same dwell verb everywhere. **Curated harmonious palette** (5–6 colors) per mandala → results never look garish. |
| 8 | **Calibration / neutral** | **Build "B" now:** Recenter button + dead zone + expo curve. **Defer "A":** 2s calibration overlay → polish phase | A is just B + a prettier first-run wrapper around the same `neutral = currentPose` call. Recenter is needed either way. |
| 9 | **Rendering / data model** | **SVG (DOM)** — paths = regions; free hit-testing (`elementFromPoint`) + fill + crisp scaling | Region count (~50–300) is tiny for SVG. SVG is the contract both hand-authored *and* future-generated mandalas must speak. Full contract: **[MANDALA-SPEC.md](MANDALA-SPEC.md)**. |
| 10 | **Dwell loop** ✅ validated | **Region-based** dwell, **1.2s**; **must-stop gate ~60 px/s** — progress only accumulates while the cursor is parked (steer to a spot, relax head to neutral → it paints; travel never fills); **decay** reset-on-leave (~1.8/s) so a brief wobble drains rather than snaps to zero; radial **progress ring** + dot "go" ring when parked; re-dwell **recolors**; **eraser swatch** = fill back to uncolored "paper" (replaces a dedicated Undo) | Single-verb, hands-free undo. Validated in `spike/dwell.html` (must-stop 60, dwell 1.2s, decay 1.8, reset=decay). |
| 11 | **First mandala** | **Floral, 8-fold**, ~5 motif bands (center flower → hearts → pointed petals → outer scrollwork) → ~5 color groups. **AI-authored SVG wedge (closed tagged paths) + rotate-copy ×8.** Reference: a coloringbunny floral coloring page (style only). | "Generator" for now = author one tagged 45° wedge + replicate — **not** a full parametric generator (deferred, confirmed). Palette: **9 colors (pink → orange → green) + erase** → pinks `#f9b4cb` `#ec7396` `#c84e78`, oranges `#f7b267` `#f4904f` `#e1672e`, greens `#a8cf9f` `#6aa873` `#2f7d5b`; eraser = paper `#f4efe6`. |

### Non-negotiable feel parameters
- **Dead zone** around neutral → head at rest = cursor dead still.
- **Expo response curve** → small tilt = slow/fine, big tilt = fast travel.
- **One-Euro filter** (or equivalent smoothing) on the head angles to kill jitter.

---

## 3. Planned Mode 2 (after A ships)

- **Guided / paint-by-numbers mode** (the user *likes* being given art instructions).
  Not just passive "magic reveal" — the app **highlights the next region**, **suggests its color**, and your dwell confirms.
- Thin layer on the same engine: same regions, same palette, same dwell. Adds a per-region target-color map + a "next target" highlight.

---

## 4. Tech stack

**Decided:**
- **Head tracking: MediaPipe Face Landmarker (`@mediapipe/tasks-vision`).** In-browser (WASM + WebGL), **fully on-device → privacy story for free.** One model gives us everything:
  - `facialTransformationMatrixes` → yaw / pitch / roll = **the joystick**.
  - `faceBlendshapes` → `jawOpen` = **mouth clutch**; `browInnerUp`/`browOuterUp` = optional color-cycle.
  - 478 `faceLandmarks` if we ever need finer control.

**Decided (cont.):**
- **Framework: React + Vite + TypeScript** — with a hard rule: the **engine** (head-tracking, pose→cursor pipeline, SVG mandala controller, dwell logic) lives in framework-agnostic `/engine` TS modules with **zero React imports**. React renders only the shell (palette dock, toggles, onboarding) and reads engine state via a thin hook. Keeps the real-time core testable & portable to a future Svelte / React-Native shell.
- **Rendering: SVG** (paths = regions; free hit-test & fill; crisp). Optional canvas/WebGL overlay for B-phase "juice" (glow/particles). Contract: [MANDALA-SPEC.md](MANDALA-SPEC.md).

**Still open:**
- Hosting — any static host over HTTPS (camera needs a secure context). Low-stakes; decide at deploy.

---

## 5. Core pipeline (the real work — built once, used everywhere)

```
head pose → (angle − neutral) → dead zone → expo curve → velocity → integrate → cursor position
```

Everything else (calibration vs not, axes, smoothing) is a tweak around this single pipeline.

---

## 6. De-risking spike — ✅ PASSED (2026-06-20)

**The core bet is validated:** flailing your head to move a velocity-cursor *feels good* and is controllable on the user's real hardware. Greenlight to build the real thing.

**Validated tuning (baseline defaults for the real build):**
- Sensitivity (top speed): **1200**
- Dead zone: **3°**
- Expo (response curve): **1.7**
- Smoothing: **0.6**
- Axis signs (validated): **Invert X = ON, Invert Y = OFF** — look right → cursor right, nod down → cursor down. Spike defaults updated to match.
- Mouth-open clutch (`jawOpen`): talking pushes it to ~40%, so a usable threshold is **≥ 0.5 with a brief hold** to avoid talk false-fires. Reserved feature — not on A's critical path (A uses dwell).

**Goal (original):** validate the entire bet — *does flailing your head to move a cursor feel good?* — before building any coloring engine on top.

Build the **mechanic in miniature**, judged by **feel, not data** (the user is the only qualified judge):
- corner webcam preview,
- **one big dot** driven by the *real* velocity pipeline,
- **Recenter** button,
- **mouth-open bar** (lights up when `jawOpen` crosses threshold),
- tuning sliders (sensitivity / dead zone / smoothing) so a bad default doesn't cause a false "this feels bad."

**Pass/fail — the user judges all five:**
1. **Follows you?** Head moves → dot moves, smooth (not a slideshow).
2. **Can you park it?** Dot into each corner + center, *stop it there*, within ~10s, no rage-quit.
3. **Holds still?** Head at rest → dot sits still (dead zone works), no vibration.
4. **Clutch fires clean?** Mouth open → bar spikes; talking/neutral → no false fire.
5. **Works in your room?** Real lighting, glasses, real webcam.

**If good →** the project is real; resume grilling §7.
**If bad →** pivot (absolute mapping? heavier smoothing? hand gestures sooner?).

---

## 7. OPEN QUESTIONS — resume grilling here

> **Build-readiness:** none of the remaining open items block the first mandala / asset pipeline — they're all **app-shell** decisions, better answered once a real mandala is on screen. Deferred to "after first mandala": onboarding/permission, edge cases, visual bar (B), sharing, mobile, hosting.

- **Framework**: ✅ decided → **React + Vite + TS**, engine isolated in `/engine` (zero React imports). Mobile pivot reuses `/engine`, rewrites the camera + render layer.
- **Rendering**: ✅ decided → **SVG**. The mandala asset contract is specified in **[MANDALA-SPEC.md](MANDALA-SPEC.md)**.
- **Mandala source**: ✅ AI-authored SVG wedge (closed tagged paths, floral, 8-fold) + rotate-copy ×8. Image refs for style only. Full parametric generator deferred.
- **Onboarding / first-run UX**: camera permission prompt, teaching the single dwell verb.
- **Edge cases**: no camera / permission denied, poor lighting, multiple faces, user leaves frame, weak-hardware performance.
- **Visual / aesthetic bar for B**: background, fill animation, glow/particles, sound design?
- **Shareability**: screenshot/export, replay, watermark?
- **Dwell loop**: ✅ validated — region-based, 1.2s, must-stop ~60 px/s, **decay** reset (~1.8), progress ring + dot "go" ring, re-dwell recolors.
- **Undo (no hands)**: ✅ via an **eraser swatch** (fills a region back to uncolored). Global multi-step undo deferred.
- **Mobile pivot specifics**: front camera, orientation, performance budget.
