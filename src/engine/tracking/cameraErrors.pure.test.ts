import { describe, it, expect } from 'vitest'
import {
  classifyCameraError,
  faultOf,
  type CameraFaultKind,
} from './cameraErrors.pure'

/** A DOMException stand-in — only `.name` matters to the classifier. */
const ex = (name: string): { name: string; message: string } => ({
  name,
  message: `${name} message`,
})

describe('classifyCameraError — name → fault kind', () => {
  const cases: Array<[string, CameraFaultKind]> = [
    ['NotAllowedError', 'denied'],
    ['PermissionDeniedError', 'denied'],
    ['NotFoundError', 'no-device'],
    ['DevicesNotFoundError', 'no-device'],
    ['OverconstrainedError', 'no-device'],
    ['ConstraintNotSatisfiedError', 'no-device'],
    ['NotReadableError', 'in-use'],
    ['TrackStartError', 'in-use'],
    ['AbortError', 'in-use'],
    ['SecurityError', 'insecure'],
    ['TypeError', 'unsupported'],
  ]

  it.each(cases)('%s → %s', (name, kind) => {
    expect(classifyCameraError(ex(name)).kind).toBe(kind)
  })

  it('falls back to "unknown" for an unrecognised name', () => {
    expect(classifyCameraError(ex('WeirdNewError')).kind).toBe('unknown')
  })
})

describe('classifyCameraError — defensive against junk input', () => {
  it('handles null / undefined / strings / numbers without throwing', () => {
    for (const junk of [null, undefined, 'NotAllowedError', 42, {}]) {
      expect(classifyCameraError(junk).kind).toBe('unknown')
    }
  })

  it('ignores a non-string name field', () => {
    expect(classifyCameraError({ name: 123 }).kind).toBe('unknown')
  })
})

describe('CameraFault shape', () => {
  const ALL: CameraFaultKind[] = [
    'denied',
    'no-device',
    'in-use',
    'insecure',
    'unsupported',
    'lost',
    'model',
    'unknown',
  ]

  it.each(ALL)('faultOf(%s) carries copy + retryability', (kind) => {
    const fault = faultOf(kind)
    expect(fault.kind).toBe(kind)
    expect(fault.title.length).toBeGreaterThan(0)
    expect(fault.detail.length).toBeGreaterThan(0)
    expect(typeof fault.retryable).toBe('boolean')
  })

  it('marks config-level faults non-retryable, recoverable ones retryable', () => {
    expect(faultOf('insecure').retryable).toBe(false)
    expect(faultOf('unsupported').retryable).toBe(false)
    expect(faultOf('denied').retryable).toBe(true)
    expect(faultOf('lost').retryable).toBe(true)
  })

  it('round-trips kind through classifyCameraError', () => {
    expect(classifyCameraError(ex('NotAllowedError'))).toEqual(faultOf('denied'))
  })
})
