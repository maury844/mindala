# draw — head-controlled mandala coloring

Color a mandala **hands-free, steering the cursor with your head** (webcam +
MediaPipe). Turn / nod your head to move a velocity cursor; relax to neutral so
it stops over a region; **dwell** to fill it, and the fill **mirrors across all
8 wedges**. Pick colors (or the eraser) from the left dock with the same dwell
verb.

This is **Phase A**: a deliberately ridiculous, shareable toy — built clean so it
can grow into a polished portfolio piece (Phase B). See
[DISCOVERY.md](DISCOVERY.md) to get oriented, [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md)
for the build spec, and [DESIGN.md](DESIGN.md) for the locked decisions.

## Run it

```bash
npm install
npm run dev      # Vite dev server → http://localhost:5173
```

Open the URL, click **Enable camera & start**, and allow camera access. The first
run downloads the MediaPipe face model (~3 MB) once.

> **Camera needs a secure context.** `localhost` (the Vite dev server) and any
> HTTPS host work. Plain `http://` on a LAN IP or `file://` will **not** get
> camera access — the browser blocks `getUserMedia` outside a secure context.
> The camera feed never leaves your device; tracking runs entirely in-browser.

### Controls
- **Turn / nod your head** — move the cursor (relax to neutral to stop).
- **Dwell on a petal** — fill it (mirrors ×8). Dwell a swatch to pick its color;
  dwell the eraser, then a region, to reset it to paper.
- **Recenter** button (top-right) or **Space** — re-zero your neutral head pose.
- **`d`** — toggle the diagnostics overlay (fps / face / target / progress).

## Scripts

| Command             | What it does                                            |
| ------------------- | ------------------------------------------------------- |
| `npm run dev`       | Vite dev server (the app, plus throwaway dev routes).   |
| `npm run build`     | Type-check then production build to `dist/`.            |
| `npm run preview`   | Serve the production build locally.                     |
| `npm run typecheck` | `tsc` strict, no emit.                                  |
| `npm run lint`      | ESLint (incl. the engine-boundary rule).               |
| `npm test`          | Vitest unit suite (the `engine/*.pure.ts` regressions). |

### Throwaway dev routes (not shipped)
Served by `npm run dev` only — they exercise one engine slice each:
- `/tracking.html` — live head pose + blendshapes (M1).
- `/mandala.html` — the generated mandala + its rendered acceptance checks (M3).

## Architecture (one rule to remember)

`src/engine/` imports **nothing** from React — it's a portable, unit-tested
real-time core (tracking → cursor → dwell → mandala). React only renders the
shell and reads engine state through the single `useEngine` hook
(`src/app/hooks/useEngine.ts`), which owns the one `requestAnimationFrame` loop:

```
faceTracker.detect → velocityCursor.update → webView.resolveTargetAt
  → dwellController.update → apply fill / erase / selectColor event
```

The boundary is enforced by lint, so the core stays ready for a future
mobile / Svelte shell. All "feel" constants live in `src/engine/config.ts`.
