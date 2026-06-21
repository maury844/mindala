/**
 * dwellController.pure.ts — the "park to paint" loop as a DOM-free state machine.
 *
 * This is the portable half of the dwell mechanic validated in `spike/dwell.html`:
 * the timing, the must-stop gate, the decay-on-leave reset, and the disarm-after-
 * commit latch. It owns NO DOM and NO palette state — each tick it is told what
 * the cursor is over (`target`), how fast the cursor is moving (`speed`), how much
 * time passed (`dt`), and which color is active. When a dwell completes it returns
 * an *event* describing what should happen; the React shell (M5) maps that event
 * to `webView.fillGroup/eraseGroup` and to its own active-color state.
 *
 * The gesture (DISCOVERY §3/§9): steer the cursor over a region, then relax your
 * head to neutral so it stops — only a (near-)stopped cursor accumulates progress,
 * so travelling through regions never misfires. Progress is keyed by the target's
 * `key` (a symmetry group for regions), so dwelling any rotational sibling charges
 * the whole mirror group and the fill mirrors ×N.
 *
 * Reset mode is locked to **decay** (DISCOVERY §4 `RESET_MODE`): leaving a region
 * drains its progress at `DECAY`/s rather than snapping to zero, which felt best on
 * real hardware. The spike's experimental "instant" mode is not shipped.
 *
 * All feel constants come from `config.ts`. Part of `engine/` — imports nothing
 * from React or the DOM (the `.pure.ts` guarantee).
 */

import { DWELL } from '../config'

/**
 * What the cursor is over on a given tick, normalized away from the DOM. This is
 * exactly what `webView.resolveTargetAt` produces, so the shell can pass it
 * straight through. `key` is the identity the dwell tracks; for regions it is the
 * symmetry group (so all N siblings share one charge), for swatches it is the
 * swatch id.
 */
export type DwellTarget =
  | { kind: 'region'; key: string; group: string }
  | { kind: 'swatch'; key: string; color: string; erase: boolean }

/** One frame of input for {@link DwellController.update}. */
export interface DwellTick {
  /** The swatch/region under the cursor, or `null` for neither (paper/void). */
  target: DwellTarget | null
  /** Cursor speed in px/s (`VelocityCursor` `speed`). The must-stop gate reads this. */
  speed: number
  /** Elapsed seconds since the previous tick. The caller clamps tab-switch spikes. */
  dt: number
  /** The currently-selected color a region fill should use. */
  activeColor: string
}

/**
 * Emitted on the single tick a dwell completes:
 *   - `selectColor` — a swatch was dwelled (eraser reports the paper color).
 *   - `fill`        — a region was dwelled with a real color active.
 *   - `erase`       — a region was dwelled while the eraser (paper) was active.
 */
export type DwellEvent =
  | { kind: 'selectColor'; color: string }
  | { kind: 'fill'; group: string; color: string }
  | { kind: 'erase'; group: string }

/** The controller's per-tick output. `event` is present only on a completion. */
export interface DwellState {
  /** Fill progress on the current target, `0..1`. */
  progress: number
  /** True while progress is actively accumulating — the cursor's "go" cue. */
  charging: boolean
  /** Defined exactly on the tick a dwell completes; otherwise omitted. */
  event?: DwellEvent
}

export interface DwellControllerOptions {
  /**
   * The paper/erase color. A region dwell with this color active emits `erase`
   * instead of `fill`, and the eraser swatch's `selectColor` reports it. This is
   * the controller's only knowledge of the asset — keeps the shell's active color
   * the single source of truth for fill-vs-erase.
   */
  paper: string
}

/**
 * Stateful dwell loop. One instance per session; drive it once per rAF frame from
 * the shell's render loop (M5):
 *
 *   const dwell = new DwellController({ paper })
 *   const { progress, charging, event } = dwell.update({ target, speed, dt, activeColor })
 *   if (event) applyEvent(event)   // fillGroup / eraseGroup / setActiveColor
 *
 * Mirrors the state machine in `spike/dwell.html` (lines ~183–249) exactly, minus
 * the DOM and the dropped "instant" reset mode.
 */
export class DwellController {
  private readonly paper: string

  /** The target currently charging, by key, or `null`. */
  private activeKey: string | null = null
  /** Snapshot of that target, kept so a completion knows what to emit. */
  private activeTarget: DwellTarget | null = null
  /** Charge on the active target, `0..1`. */
  private progress = 0
  /**
   * After a commit, the just-filled key is latched here so re-arming requires
   * leaving it first — you can't repeat-fill a region you're still parked on.
   */
  private disarmedKey: string | null = null

  constructor(options: DwellControllerOptions) {
    this.paper = options.paper
  }

  /** Current progress/charging without advancing — handy for the dev overlay. */
  get state(): DwellState {
    return { progress: this.progress, charging: false }
  }

  /**
   * Advance one frame. Returns the current progress, whether it is charging, and
   * — only on the tick a dwell completes — the resulting {@link DwellEvent}.
   */
  update({ target, speed, dt, activeColor }: DwellTick): DwellState {
    const id = target?.key ?? null
    // "Moving" cursor (head still tilted) never paints; relax to neutral to charge.
    const moving = speed > DWELL.MUST_STOP

    // Re-arm as soon as the cursor leaves the just-committed target.
    if (this.disarmedKey !== null && id !== this.disarmedKey) {
      this.disarmedKey = null
    }

    let charging = false
    let event: DwellEvent | undefined

    if (id !== null && id !== this.disarmedKey) {
      if (id === this.activeKey) {
        // Same target: accumulate only while (near-)stopped.
        if (!moving) {
          this.progress += dt / DWELL.DWELL_TIME
          charging = true
        }
      } else {
        // A new target can't be adopted until the old charge has drained
        // (decay reset) — this is what keeps a glide-by from snapping focus.
        this.progress -= dt * DWELL.DECAY
        if (this.progress <= 0) {
          this.progress = 0
          this.activeKey = id
          this.activeTarget = target
        }
      }

      if (this.progress >= 1) {
        event = this.commit(this.activeTarget, activeColor)
        this.progress = 0
        this.disarmedKey = this.activeKey
        this.activeKey = null
        this.activeTarget = null
        charging = false
      }
    } else {
      // Over nothing (or the disarmed target): drain toward zero, then release.
      this.progress = Math.max(0, this.progress - dt * DWELL.DECAY)
      if (this.progress === 0) {
        this.activeKey = null
        this.activeTarget = null
      }
    }

    return event === undefined
      ? { progress: this.progress, charging }
      : { progress: this.progress, charging, event }
  }

  /** Translate a completed target into the event the shell should act on. */
  private commit(target: DwellTarget | null, activeColor: string): DwellEvent {
    if (target?.kind === 'swatch') {
      return { kind: 'selectColor', color: target.erase ? this.paper : target.color }
    }
    // A region: erase when the eraser (paper) is active, otherwise fill.
    const group = target?.kind === 'region' ? target.group : ''
    return activeColor === this.paper
      ? { kind: 'erase', group }
      : { kind: 'fill', group, color: activeColor }
  }
}
