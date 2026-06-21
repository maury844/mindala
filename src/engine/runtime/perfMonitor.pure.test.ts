import { describe, it, expect } from 'vitest'
import { PerfMonitor } from './perfMonitor.pure'

const OPTS = { lowFps: 15, tripSeconds: 4, clearSeconds: 3 }

/** Feed `seconds` of steady `fps` in fixed dt steps; return final degraded flag. */
function run(m: PerfMonitor, fps: number, seconds: number, dt = 1 / 60): boolean {
  let out = m.degraded
  for (let t = 0; t < seconds; t += dt) out = m.sample(fps, dt)
  return out
}

describe('PerfMonitor — trip', () => {
  it('does not trip before the trip window elapses', () => {
    const m = new PerfMonitor(OPTS)
    expect(run(m, 8, 3.9)).toBe(false)
  })

  it('trips once fps stays below the threshold for tripSeconds', () => {
    const m = new PerfMonitor(OPTS)
    expect(run(m, 8, 4.1)).toBe(true)
  })

  it('never trips while fps stays at/above the threshold', () => {
    const m = new PerfMonitor(OPTS)
    expect(run(m, 60, 30)).toBe(false)
  })

  it('treats exactly lowFps as healthy (strict <)', () => {
    const m = new PerfMonitor(OPTS)
    expect(run(m, 15, 30)).toBe(false)
  })
})

describe('PerfMonitor — hysteresis', () => {
  it('clears only after fps recovers for clearSeconds', () => {
    const m = new PerfMonitor(OPTS)
    run(m, 8, 5) // trip
    expect(m.degraded).toBe(true)
    expect(run(m, 60, 2.9)).toBe(true) // not yet recovered
    expect(run(m, 60, 0.2)).toBe(false) // crosses clearSeconds total
  })

  it('does not flicker: a brief healthy blip resets recovery, stays degraded', () => {
    const m = new PerfMonitor(OPTS)
    run(m, 8, 5) // trip
    run(m, 60, 1) // 1s of recovery (needs 3)
    run(m, 8, 0.1) // dip again resets aboveAcc
    expect(run(m, 60, 2.5)).toBe(true) // 2.5s < clearSeconds from reset
  })

  it('a brief dip below threshold does not trip on its own', () => {
    const m = new PerfMonitor(OPTS)
    run(m, 60, 10)
    run(m, 8, 1) // 1s low (needs 4)
    expect(run(m, 60, 10)).toBe(false)
  })
})

describe('PerfMonitor — robustness', () => {
  it('ignores non-positive dt and non-finite fps', () => {
    const m = new PerfMonitor(OPTS)
    m.sample(0, -1)
    m.sample(NaN, 1)
    m.sample(Infinity, 1)
    expect(m.degraded).toBe(false)
  })

  it('reset() clears degraded state and accumulators', () => {
    const m = new PerfMonitor(OPTS)
    run(m, 8, 5)
    expect(m.degraded).toBe(true)
    m.reset()
    expect(m.degraded).toBe(false)
    expect(run(m, 8, 3.9)).toBe(false) // accumulator was cleared
  })

  it('uses RUNTIME defaults when no options are given', () => {
    const m = new PerfMonitor()
    // Default LOW_FPS=15, PERF_TRIP_SEC=4: 5s at 5fps must trip.
    expect(run(m, 5, 5)).toBe(true)
  })
})
