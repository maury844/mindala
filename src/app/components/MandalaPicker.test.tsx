import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import MandalaPicker from './MandalaPicker'
import type { MandalaDoc } from '../../engine/mandala/types'

afterEach(cleanup)

function doc(id: string, title: string): MandalaDoc {
  return {
    id,
    title,
    symmetryOrder: 8,
    paper: '#f4efe6',
    palettes: [{ name: 'p', colors: ['#000000'] }],
    svg: `<svg viewBox="0 0 1000 1000"><circle data-region-id="center" cx="500" cy="500" r="80"/></svg>`,
  }
}

const docs = [doc('floral-01', 'Floral 8'), doc('compass-08', 'Compass 8')]

describe('MandalaPicker', () => {
  it('renders one thumbnail per mandala, labeled by title', () => {
    render(<MandalaPicker mandalas={docs} activeId="floral-01" onSelect={() => {}} />)
    expect(screen.getByLabelText('Floral 8')).toBeDefined()
    expect(screen.getByLabelText('Compass 8')).toBeDefined()
  })

  it('marks only the active mandala pressed', () => {
    render(<MandalaPicker mandalas={docs} activeId="compass-08" onSelect={() => {}} />)
    expect(screen.getByLabelText('Compass 8').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Floral 8').getAttribute('aria-pressed')).toBe('false')
  })

  it('embeds each mandala’s own SVG as its thumbnail', () => {
    const { container } = render(
      <MandalaPicker mandalas={docs} activeId="floral-01" onSelect={() => {}} />,
    )
    expect(container.querySelectorAll('svg')).toHaveLength(2)
  })

  it('reports the clicked mandala’s id', () => {
    const onSelect = vi.fn()
    render(<MandalaPicker mandalas={docs} activeId="floral-01" onSelect={onSelect} />)
    fireEvent.click(screen.getByLabelText('Compass 8'))
    expect(onSelect).toHaveBeenCalledWith('compass-08')
  })

  it('hides itself when there is nothing to choose between', () => {
    const { container } = render(
      <MandalaPicker mandalas={[docs[0]]} activeId="floral-01" onSelect={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })
})
