import { describe, it, expect } from 'vitest'
import { DWELL } from '../config'
import {
  DwellController,
  type DwellEvent,
  type DwellTarget,
  type DwellTick,
} from './dwellController.pure'

const PAPER = '#f4efe6'
const COLOR = '#ec7396'

/** A region target keyed by its symmetry group (mirror-group identity). */
const region = (group: string): DwellTarget => ({
  kind: 'region',
  key: `rg:${group}`,
  group,
})

/** A color swatch target. */
const swatch = (id: string, color: string): DwellTarget => ({
  kind: 'swatch',
  key: `sw:${id}`,
  color,
  erase: false,
})

/** The eraser swatch (reports paper). */
const eraser: DwellTarget = {
  kind: 'swatch',
  key: 'sw:erase',
  color: PAPER,
  erase: true,
}

const newController = () => new DwellController({ paper: PAPER })

const DT = 1 / 60
/** Fixed-step ticks at `speed`, returning every state so events can be counted. */
function run(
  ctrl: DwellController,
  target: DwellTarget | null,
  seconds: number,
  opts: { speed?: number; activeColor?: string; dt?: number } = {},
) {
  const { speed = 0, activeColor = COLOR, dt = DT } = opts
  const out = []
  for (let t = 0; t < seconds; t += dt) {
    out.push(ctrl.update({ target, speed, dt, activeColor } satisfies DwellTick))
  }
  return out
}

const events = (states: { event?: DwellEvent }[]): DwellEvent[] =>
  states.flatMap((s) => (s.event ? [s.event] : []))

describe('DwellController — must-stop gate', () => {
  it('never increases progress while the cursor is moving', () => {
    const ctrl = newController()
    const states = run(ctrl, region('petals'), 3, { speed: DWELL.MUST_STOP + 1 })
    for (const s of states) {
      expect(s.progress).toBe(0)
      expect(s.charging).toBe(false)
    }
    expect(events(states)).toHaveLength(0)
  })

  it('charges while stopped but freezes progress the instant it starts moving', () => {
    const ctrl = newController()
    // Charge halfway (stopped)...
    run(ctrl, region('petals'), DWELL.DWELL_TIME / 2, { speed: 0 })
    const half = ctrl.state.progress
    expect(half).toBeGreaterThan(0.3)
    expect(half).toBeLessThan(1)
    // ...then move while staying over the SAME region: progress holds, no decay.
    const moving = run(ctrl, region('petals'), 0.5, { speed: DWELL.MUST_STOP + 50 })
    for (const s of moving) expect(s.progress).toBeCloseTo(half, 10)
  })
})

describe('DwellController — completion', () => {
  it('fires exactly one completion after DWELL_TIME parked on a target', () => {
    const ctrl = newController()
    // Run well past DWELL_TIME to prove it only ever fires once.
    const states = run(ctrl, region('petals'), DWELL.DWELL_TIME * 3, { speed: 0 })
    const evs = events(states)
    expect(evs).toHaveLength(1)
    expect(evs[0]).toEqual({ kind: 'fill', group: 'petals', color: COLOR })
  })

  it('takes ~DWELL_TIME of stopped ticks to complete', () => {
    const ctrl = newController()
    let elapsed = 0
    let fired = false
    while (elapsed < DWELL.DWELL_TIME * 2 && !fired) {
      const s = ctrl.update({ target: region('petals'), speed: 0, dt: DT, activeColor: COLOR })
      elapsed += DT
      if (s.event) fired = true
    }
    expect(fired).toBe(true)
    // Within ~one tick of DWELL_TIME (robust to float accumulation of dt).
    expect(elapsed).toBeCloseTo(DWELL.DWELL_TIME, 1)
  })
})

describe('DwellController — decay on leave', () => {
  it('drains progress at DECAY/s when the cursor leaves (not instant)', () => {
    const ctrl = newController()
    run(ctrl, region('petals'), DWELL.DWELL_TIME * 0.6, { speed: 0 })
    const before = ctrl.state.progress
    expect(before).toBeGreaterThan(0)

    // One tick over nothing: progress should drop by ~DECAY*dt, not to zero.
    const s = ctrl.update({ target: null, speed: 0, dt: DT, activeColor: COLOR })
    expect(s.progress).toBeCloseTo(before - DWELL.DECAY * DT, 6)
    expect(s.progress).toBeGreaterThan(0)
  })

  it('eventually drains to exactly zero and releases the target', () => {
    const ctrl = newController()
    run(ctrl, region('petals'), DWELL.DWELL_TIME * 0.6, { speed: 0 })
    const states = run(ctrl, null, 2, { speed: 0 })
    expect(states.at(-1)?.progress).toBe(0)
    expect(events(states)).toHaveLength(0)
  })

  it('cannot adopt a new target until the old charge has drained', () => {
    const ctrl = newController()
    run(ctrl, region('a'), DWELL.DWELL_TIME * 0.5, { speed: 0 })
    const charged = ctrl.state.progress
    // Immediately park on a different region: first tick drains, doesn't charge.
    const s = ctrl.update({ target: region('b'), speed: 0, dt: DT, activeColor: COLOR })
    expect(s.progress).toBeCloseTo(charged - DWELL.DECAY * DT, 6)
    expect(s.charging).toBe(false)
  })
})

describe('DwellController — re-arm after commit', () => {
  it('does not repeat-fill while parked on a just-filled region', () => {
    const ctrl = newController()
    const first = run(ctrl, region('petals'), DWELL.DWELL_TIME * 3, { speed: 0 })
    expect(events(first)).toHaveLength(1)
    // Stay parked far longer: still no second fill, no charging.
    const stay = run(ctrl, region('petals'), DWELL.DWELL_TIME * 2, { speed: 0 })
    expect(events(stay)).toHaveLength(0)
    for (const s of stay) expect(s.charging).toBe(false)
  })

  it('re-fills after the cursor leaves and returns', () => {
    const ctrl = newController()
    run(ctrl, region('petals'), DWELL.DWELL_TIME * 1.5, { speed: 0 }) // fill #1
    run(ctrl, null, 1, { speed: 0 }) // leave → re-arm + drain
    const again = run(ctrl, region('petals'), DWELL.DWELL_TIME * 1.5, { speed: 0 })
    expect(events(again)).toEqual([{ kind: 'fill', group: 'petals', color: COLOR }])
  })
})

describe('DwellController — target kinds → events', () => {
  it('a color swatch emits selectColor with that color', () => {
    const ctrl = newController()
    const evs = events(run(ctrl, swatch('2', COLOR), DWELL.DWELL_TIME * 1.5, { speed: 0 }))
    expect(evs).toEqual([{ kind: 'selectColor', color: COLOR }])
  })

  it('the eraser swatch emits selectColor with the paper color', () => {
    const ctrl = newController()
    const evs = events(run(ctrl, eraser, DWELL.DWELL_TIME * 1.5, { speed: 0 }))
    expect(evs).toEqual([{ kind: 'selectColor', color: PAPER }])
  })

  it('a region with a real color active emits fill', () => {
    const ctrl = newController()
    const evs = events(
      run(ctrl, region('hearts'), DWELL.DWELL_TIME * 1.5, { speed: 0, activeColor: COLOR }),
    )
    expect(evs).toEqual([{ kind: 'fill', group: 'hearts', color: COLOR }])
  })

  it('a region with the eraser (paper) active emits erase, not fill', () => {
    const ctrl = newController()
    const evs = events(
      run(ctrl, region('hearts'), DWELL.DWELL_TIME * 1.5, { speed: 0, activeColor: PAPER }),
    )
    expect(evs).toEqual([{ kind: 'erase', group: 'hearts' }])
  })

  it('uses the activeColor supplied on the completing tick', () => {
    const ctrl = newController()
    const other = '#2f7d5b'
    const evs = events(
      run(ctrl, region('outer'), DWELL.DWELL_TIME * 1.5, { speed: 0, activeColor: other }),
    )
    expect(evs).toEqual([{ kind: 'fill', group: 'outer', color: other }])
  })
})

describe('DwellController — idle', () => {
  it('does nothing while the cursor is over neither region nor swatch', () => {
    const ctrl = newController()
    const states = run(ctrl, null, 3, { speed: 0 })
    for (const s of states) {
      expect(s.progress).toBe(0)
      expect(s.charging).toBe(false)
    }
    expect(events(states)).toHaveLength(0)
  })
})
