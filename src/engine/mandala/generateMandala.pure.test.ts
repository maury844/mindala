import { describe, it, expect } from 'vitest'
import {
  generate,
  describeRegions,
  buildMandalaDoc,
} from './generateMandala.pure'
import { floralMotif } from './floralWedge'

const N = 8

function parse(svg: string): Document {
  return new DOMParser().parseFromString(svg, 'image/svg+xml')
}

describe('generate (rotate-copy → spec SVG)', () => {
  const doc = parse(generate(floralMotif, N))

  it('uses the spec viewBox and a non-fillable background rect', () => {
    expect(doc.querySelector('svg')!.getAttribute('viewBox')).toBe(
      '0 0 1000 1000',
    )
    const bg = doc.querySelector('[data-role="background"]')!
    expect(bg.getAttribute('pointer-events')).toBe('none')
  })

  it('gives the regions layer a paper default fill and a visible stroke', () => {
    const layer = doc.querySelector('[data-layer="regions"]')!
    expect(layer.getAttribute('fill')).toBe('#f4efe6')
    expect(layer.getAttribute('stroke')).toBeTruthy()
    expect(Number(layer.getAttribute('stroke-width'))).toBeGreaterThan(0)
  })

  it('tags every fillable region with a unique id and a symmetry group', () => {
    const regions = [...doc.querySelectorAll('[data-symmetry-group]')]
    expect(regions).toHaveLength(floralMotif.shapes.length * N + 1) // +center
    const ids = regions.map((r) => r.getAttribute('data-region-id'))
    expect(ids.every((id) => !!id)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length) // unique
    expect(regions.every((r) => r.getAttribute('data-symmetry-group'))).toBe(
      true,
    )
  })

  it('gives each motif group N siblings and the center a group of 1', () => {
    for (const s of floralMotif.shapes) {
      expect(
        doc.querySelectorAll(`[data-symmetry-group="${s.groupId}"]`),
      ).toHaveLength(N)
    }
    expect(doc.querySelectorAll('[data-symmetry-group="center"]')).toHaveLength(
      1,
    )
  })

  it('produces exactly (motif shapes + center) distinct groups', () => {
    const groups = new Set(
      [...doc.querySelectorAll('[data-symmetry-group]')].map((r) =>
        r.getAttribute('data-symmetry-group'),
      ),
    )
    expect(groups.size).toBe(floralMotif.shapes.length + 1)
  })

  it('emits the center once as a <circle>', () => {
    expect(doc.querySelectorAll('circle[data-region-id="center"]')).toHaveLength(
      1,
    )
  })

  it('emits N rotate-copied wedges', () => {
    const wedges = [...doc.querySelectorAll('[data-wedge]')]
    expect(wedges).toHaveLength(N)
    expect(wedges[0].getAttribute('transform')).toBe('rotate(0 500 500)')
    expect(wedges[1].getAttribute('transform')).toBe('rotate(45 500 500)')
  })

  it('parses cleanly and every path is closed (M…Z)', () => {
    expect(doc.querySelector('parsererror')).toBeNull()
    const paths = [...doc.querySelectorAll('path')]
    expect(paths.length).toBeGreaterThan(0)
    for (const p of paths) {
      const d = p.getAttribute('d')!
      expect(d.startsWith('M')).toBe(true)
      expect(d.trimEnd().endsWith('Z')).toBe(true)
    }
  })

  it('rejects a non-positive or non-integer symmetry order', () => {
    expect(() => generate(floralMotif, 0)).toThrow()
    expect(() => generate(floralMotif, -8)).toThrow()
    expect(() => generate(floralMotif, 2.5)).toThrow()
  })
})

describe('describeRegions', () => {
  it('mirrors the SVG ids and group membership without the DOM', () => {
    const { regions, groups } = describeRegions(floralMotif, N)
    expect(regions).toHaveLength(floralMotif.shapes.length * N + 1)

    const ids = regions.map((r) => r.regionId)
    expect(new Set(ids).size).toBe(ids.length) // unique

    for (const g of groups) {
      expect(g.regionIds).toHaveLength(g.id === 'center' ? 1 : N)
    }

    // The logical ids must equal the ids the SVG actually carries.
    const doc = parse(generate(floralMotif, N))
    const svgIds = [...doc.querySelectorAll('[data-region-id]')].map((r) =>
      r.getAttribute('data-region-id'),
    )
    expect(new Set(ids)).toEqual(new Set(svgIds))
  })
})

describe('buildMandalaDoc', () => {
  it('bundles metadata with a generated SVG at the right symmetry order', () => {
    const doc = buildMandalaDoc(
      {
        id: 'x',
        title: 'X',
        symmetryOrder: 6,
        paper: '#ffffff',
        palettes: [{ name: 'p', colors: ['#000000'] }],
      },
      floralMotif,
    )
    expect(doc.symmetryOrder).toBe(6)
    expect(doc.svg).toContain('viewBox="0 0 1000 1000"')
    expect(doc.svg).toContain('fill="#ffffff"') // paper applied
    expect(parse(doc.svg).querySelectorAll('[data-wedge]')).toHaveLength(6)
  })
})
