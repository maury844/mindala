# draw — head-controlled mandala coloring

Webapp where you color mandalas **hands-free, steering the cursor with your head** (webcam + MediaPipe). Velocity cursor (turn/nod) → relax to neutral to stop → **dwell-fills** a region → mirrors across the mandala. Goal: a ridiculous shareable toy (A), architected to become a polished portfolio piece (B).

## Read these before doing anything
1. **[DISCOVERY.md](DISCOVERY.md)** — START HERE. Orientation, validated constants, architecture, build order, gotchas.
2. **[IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md)** — the build spec: milestones M0–M6, each with goals, technical approach & **acceptance criteria**. Start with the top **Progress tracker** so you can pick up the current handoff state without rereading the full document.
3. **[DESIGN.md](DESIGN.md)** — decision log (11 locked decisions + deferred questions).
4. **[MANDALA-SPEC.md](MANDALA-SPEC.md)** — the SVG asset contract.

## Agent handoff rule
Before starting implementation work, check the top **Progress tracker** in [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md). When you finish, partially finish, defer, or unblock a milestone, update that tracker first and keep the milestone's local status note consistent.

## Status
Planning + de-risking **done**. M0–M4 (engine: tracking, cursor, mandala+generator+first asset, dwell controller) **done**. **M5 (React shell) done** — `useEngine` drives the single rAF loop and the full app runs at `vite dev` → `/` (camera gate → 8-fold floral mandala + palette dock + head cursor). **M6 (polish) mostly done** — recenter (button + Space), first-use + face-lost hints, responsive centering, and `README.md` are in. Two throwaway spikes (`spike/index.html`, `spike/dwell.html`) **validated the core mechanics on real hardware**; validated tuning lives in DISCOVERY §4.

**Next action:** **the only thing left for Phase A is a human running the M6 manual verify checklist at a real webcam** (steer→park→fill→mirror, swatch/eraser dwell, recenter, ≥20 fps) — the headless checks all pass but feel can only be judged on hardware. After that passes, resume the deferred app-shell grilling (DESIGN §7: onboarding, edge cases, B-phase visuals, sharing, mobile). Run the app with `npm run dev`.

## Hard rules
- `engine/` imports **nothing** from React (portability for the mobile pivot).
- Mandalas follow MANDALA-SPEC; dwell is keyed by `data-symmetry-group`; cursor must be `pointer-events:none` for `elementFromPoint` hit-testing.
- Camera needs a secure context (localhost / HTTPS).

## Run the spikes
`python -m http.server 8000 --directory C:\Projects\draw\spike` → http://localhost:8000/index.html (cursor) · /dwell.html (coloring loop).
