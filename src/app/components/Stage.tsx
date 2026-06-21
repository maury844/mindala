/**
 * Stage.tsx — the mandala surface. The generated SVG is mounted imperatively into
 * `stageRef` by `useEngine`'s web adapter (`mountMandala`), so this component is
 * just the centered container React never writes into directly.
 */

import type { RefObject } from 'react'

interface StageProps {
  stageRef: RefObject<HTMLDivElement | null>
}

export default function Stage({ stageRef }: StageProps) {
  return <div className="mandala" ref={stageRef} />
}
