// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GenotypeReport } from '../../domain/genotypeReport'
import { GenotypeReportView } from './GenotypeReportView'

const report: GenotypeReport = {
  generatedAt: '2026-09-10T18:00:00.000Z',
  totals: {
    activeLines: 1,
    breedingCages: 7,
    individualCages: 3,
    individualMice: 9,
    pendingGenotypePups: 2,
  },
  lines: [{
    line: 'Arhgef-1',
    breedingCages: 7,
    pairings: [
      { pairing: 'WT/WT', count: 3 },
      { pairing: 'KO/KO', count: 3 },
      { pairing: 'HET/HET', count: 1 },
    ],
    individualCages: 3,
    individualMice: 9,
    genotypeCounts: { WT: 3, HET: 2, KO: 3, 'RGS2 WT': 0, 'Prex KO': 0, Mixed: 0, Unknown: 1 },
    sexCounts: { Male: 4, Female: 4, Mixed: 0, Unknown: 1 },
    individualByAge: [
      { cage: '3', genotype: 'Unknown', sex: 'Unknown', dob: '2026-09-03', count: 1, age: '1 wk' },
      { cage: '2', genotype: 'HET', sex: 'Male', dob: '2026-08-01', count: 2, age: '1 mo 1 wk' },
      { cage: '1', genotype: 'WT', sex: 'Female', dob: '2026-06-01', count: 6, age: '3 mo 2 wk' },
    ],
    ageBuckets: [
      { id: 'underSixWeeks', label: '<6 weeks', count: 1 },
      { id: 'experimentReady', label: '6-8 weeks', count: 2 },
      { id: 'adultToSixMonths', label: '>8 weeks-6 months', count: 6 },
      { id: 'sixMonthsToOneYear', label: '6 months-1 year', count: 0 },
      { id: 'overOneYear', label: '>1 year', count: 0 },
    ],
    pendingGenotypePups: 2,
    pendingSources: [{ label: 'Litter ARH-B01-20260901', count: 2 }],
    attention: { unknownGenotypeMice: 1, unknownSexMice: 1, incompleteMixedMapMice: 0 },
  }],
}

describe('GenotypeReportView', () => {
  afterEach(cleanup)

  it('renders colony totals and a structured summary for each line', () => {
    render(
      <GenotypeReportView
        report={report}
        onClose={vi.fn()}
        onCopy={vi.fn()}
        onPrint={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Genotype summary' })).toBeInTheDocument()
    expect(screen.getByText('9 mice recorded')).toBeInTheDocument()
    const line = screen.getByRole('region', { name: 'Arhgef-1 genotype summary' })
    expect(line).toHaveTextContent('WT/WT')
    expect(line).toHaveTextContent('KO/KO')
    expect(line).toHaveTextContent('HET/HET')
    expect(line).toHaveTextContent('Pending genotype')
    expect(line).toHaveTextContent('Unknown genotype')
    expect(screen.getByRole('img', { name: 'Arhgef-1 genotype distribution' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Arhgef-1 age distribution' })).toBeInTheDocument()
    expect(line).toHaveTextContent('Show cage details')
    const printDetails = line.querySelector('.genotype-report-age-print')
    expect(printDetails).toHaveTextContent('Cage 3')
    expect(printDetails).toHaveTextContent('DOB Sep 3, 2026')
    expect(printDetails?.querySelectorAll('li')).toHaveLength(3)
    const ageRows = line.querySelectorAll('.genotype-report-age li')
    expect(ageRows[0]).toHaveTextContent('Cage 3')
    expect(ageRows[0]).toHaveTextContent('1 wk')
    expect(ageRows[2]).toHaveTextContent('Cage 1')
    expect(ageRows[2]).toHaveTextContent('3 mo 2 wk')
  })

  it('connects close, refresh, copy, and print controls', () => {
    const onClose = vi.fn()
    const onRefresh = vi.fn()
    const onCopy = vi.fn()
    const onPrint = vi.fn()
    render(
      <GenotypeReportView
        report={report}
        onClose={onClose}
        onCopy={onCopy}
        onPrint={onPrint}
        onRefresh={onRefresh}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Refresh report' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy report' }))
    fireEvent.click(screen.getByRole('button', { name: 'Print / Save PDF' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close genotype report' }))

    expect(onRefresh).toHaveBeenCalledOnce()
    expect(onCopy).toHaveBeenCalledOnce()
    expect(onPrint).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
