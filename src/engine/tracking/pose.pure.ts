/**
 * pose.pure.ts — head-pose math, DOM-free and dependency-free.
 *
 * Decomposes MediaPipe's `facialTransformationMatrixes[0].data` (a COLUMN-MAJOR
 * 4×4) into yaw/pitch/roll using the THREE.js 'YXZ' Euler convention, exactly as
 * validated in the spikes (`spike/index.html`). See DISCOVERY.md §4.
 *
 * This file is part of `engine/` and is marked `*.pure` — it imports NOTHING
 * (no DOM, no React, no mediapipe). Keep it that way: it is the unit-testable
 * core and the portability guarantee for the mobile pivot.
 */

/** Head pose in degrees. yaw = turn (about Y), pitch = nod (about X), roll = tilt (about Z). */
export interface Euler {
  yaw: number
  pitch: number
  roll: number
}

const RAD_TO_DEG = 180 / Math.PI

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Column-major 4×4 → yaw/pitch/roll (degrees), THREE.js 'YXZ' order.
 *
 * Indices into the column-major array (m{row}{col}, 1-indexed):
 *   m11=te[0] m12=te[4] m13=te[8]  m14=te[12]
 *   m21=te[1] m22=te[5] m23=te[9]  m24=te[13]
 *   m31=te[2] m32=te[6] m33=te[10] m34=te[14]
 *
 * Accepts `ArrayLike<number>` so it works with both MediaPipe's `number[]`
 * (`Matrix.data`) and a `Float32Array`.
 */
export function matToEuler(te: ArrayLike<number>): Euler {
  const m13 = te[8]
  const m23 = te[9]
  const m33 = te[10]
  const m21 = te[1]
  const m22 = te[5]

  const pitch = Math.asin(clamp(-m23, -1, 1))

  let yaw: number
  let roll: number
  // Away from the gimbal pole, the standard YXZ extraction is well-defined.
  if (Math.abs(m23) < 0.9999999) {
    yaw = Math.atan2(m13, m33)
    roll = Math.atan2(m21, m22)
  } else {
    // Near ±90° pitch: yaw and roll are degenerate; fall back to (-m31, m11)
    // and pin roll to 0 (matches THREE.Euler.setFromRotationMatrix for 'YXZ').
    yaw = Math.atan2(-te[2], te[0])
    roll = 0
  }

  return {
    yaw: yaw * RAD_TO_DEG,
    pitch: pitch * RAD_TO_DEG,
    roll: roll * RAD_TO_DEG,
  }
}
