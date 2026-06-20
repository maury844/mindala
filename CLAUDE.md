# draw — head-controlled mandala coloring

Webapp where you color mandalas **hands-free, steering the cursor with your head** (webcam + MediaPipe). Velocity cursor (turn/nod) → relax to neutral to stop → **dwell-fills** a region → mirrors across the mandala. Goal: a ridiculous shareable toy (A), architected to become a polished portfolio piece (B).

## Read these before doing anything
1. **[DISCOVERY.md](DISCOVERY.md)** — START HERE. Orientation, validated constants, architecture, build order, gotchas.
2. **[IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md)** — the build spec: milestones M0–M6, each with goals, technical approach & **acceptance criteria**. This is what a dev agent executes.
3. **[DESIGN.md](DESIGN.md)** — decision log (11 locked decisions + deferred questions).
4. **[MANDALA-SPEC.md](MANDALA-SPEC.md)** — the SVG asset contract.

## Status
Planning + de-risking **done**. Two throwaway spikes (`spike/index.html`, `spike/dwell.html`) **validated the core mechanics on real hardware**. Validated tuning lives in DISCOVERY §4.

**Next action:** execute **[IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) M0** (scaffold) → M6. Real app: React + Vite + TypeScript, **React-free `engine/`**, first **floral, 8-fold** mandala (author one tagged wedge + rotate-copy ×8).

## Hard rules
- `engine/` imports **nothing** from React (portability for the mobile pivot).
- Mandalas follow MANDALA-SPEC; dwell is keyed by `data-symmetry-group`; cursor must be `pointer-events:none` for `elementFromPoint` hit-testing.
- Camera needs a secure context (localhost / HTTPS).

## Run the spikes
`python -m http.server 8000 --directory C:\Projects\draw\spike` → http://localhost:8000/index.html (cursor) · /dwell.html (coloring loop).
