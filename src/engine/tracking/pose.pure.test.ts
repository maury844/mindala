import { describe, it, expect } from 'vitest'
import { matToEuler } from './pose.pure'

const DEG = Math.PI / 180

/** Pack a 3×3 row-major rotation into a column-major 4×4 (MediaPipe layout). */
function colMajor(r: number[][]): number[] {
  const m = new Array<number>(16).fill(0)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      m[col * 4 + row] = r[row][col]
    }
  }
  m[15] = 1
  return m
}

const rotY = (t: number): number[][] => [
  [Math.cos(t), 0, Math.sin(t)],
  [0, 1, 0],
  [-Math.sin(t), 0, Math.cos(t)],
]
const rotX = (t: number): number[][] => [
  [1, 0, 0],
  [0, Math.cos(t), -Math.sin(t)],
  [0, Math.sin(t), Math.cos(t)],
]
const rotZ = (t: number): number[][] => [
  [Math.cos(t), -Math.sin(t), 0],
  [Math.sin(t), Math.cos(t), 0],
  [0, 0, 1],
]

function mul3(a: number[][], b: number[][]): number[][] {
  const out = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]
    }
  }
  return out
}

describe('matToEuler', () => {
  it('identity matrix → ~0/0/0', () => {
    const identity = colMajor([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ])
    const { yaw, pitch, roll } = matToEuler(identity)
    expect(yaw).toBeCloseTo(0, 6)
    expect(pitch).toBeCloseTo(0, 6)
    expect(roll).toBeCloseTo(0, 6)
  })

  it('known yaw rotation → expected yaw (well within 0.5°)', () => {
    const { yaw, pitch, roll } = matToEuler(colMajor(rotY(30 * DEG)))
    expect(yaw).toBeCloseTo(30, 5)
    expect(pitch).toBeCloseTo(0, 5)
    expect(roll).toBeCloseTo(0, 5)
    expect(Math.abs(yaw - 30)).toBeLessThan(0.5)
  })

  it('negative yaw keeps sign', () => {
    expect(matToEuler(colMajor(rotY(-45 * DEG))).yaw).toBeCloseTo(-45, 5)
  })

  it('known pitch rotation → expected pitch', () => {
    const { yaw, pitch, roll } = matToEuler(colMajor(rotX(20 * DEG)))
    expect(pitch).toBeCloseTo(20, 5)
    expect(yaw).toBeCloseTo(0, 5)
    expect(roll).toBeCloseTo(0, 5)
  })

  it('known roll rotation → expected roll', () => {
    const { yaw, pitch, roll } = matToEuler(colMajor(rotZ(15 * DEG)))
    expect(roll).toBeCloseTo(15, 5)
    expect(yaw).toBeCloseTo(0, 5)
    expect(pitch).toBeCloseTo(0, 5)
  })

  it('combined YXZ rotation round-trips (R = Ry·Rx·Rz)', () => {
    const x = 12 * DEG
    const y = -28 * DEG
    const z = 33 * DEG
    const R = mul3(mul3(rotY(y), rotX(x)), rotZ(z))
    const { yaw, pitch, roll } = matToEuler(colMajor(R))
    expect(pitch).toBeCloseTo(12, 4)
    expect(yaw).toBeCloseTo(-28, 4)
    expect(roll).toBeCloseTo(33, 4)
  })

  it('accepts a Float32Array and stays finite at the gimbal pole', () => {
    // m23 = -1 → straight-up pitch (+90°); fp drift can push -m23 past 1, so the
    // clamp must keep asin finite (no NaN).
    const m = colMajor(rotX(90 * DEG))
    const { yaw, pitch, roll } = matToEuler(new Float32Array(m))
    expect(Number.isFinite(yaw)).toBe(true)
    expect(Number.isFinite(roll)).toBe(true)
    expect(pitch).toBeCloseTo(90, 3)
  })
})
