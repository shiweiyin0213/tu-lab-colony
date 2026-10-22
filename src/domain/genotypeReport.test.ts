import { describe, expect, it } from 'vitest'
import type { ColonyData } from '../types'
import { buildGenotypeReport, serializeGenotypeReport } from './genotypeReport'

const data: ColonyData = {
  breeding: [
    {
      id: 'breeding-1',
      line: 'Arhgef-1',
      cage: '1',
      pairing: 'WT/WT',
      maleGenotype: 'WT',
      maleDob: '2026-06-01',
      femaleGenotype: 'WT',
      femaleDob: '2026-06-01',
      pupsDob: '2026-09-01',
      pupsCount: 3,
      genotypeNeeded: true,
    },
    {
      id: 'archived-breeding',
      line: 'Archived line',
      cage: '9',
      pairing: 'KO/KO',
      maleGenotype: 'KO',
      maleDob: '2026-06-01',
      femaleGenotype: 'KO',
      femaleDob: '2026-06-01',
    },
  ],
  individual: [
    {
      id: 'mixed-1',
      line: 'Arhgef-1',
      cage: '2',
      genotype: 'Mixed',
      genotypeMap: '#1 KO; #2 HET',
      sex: 'Male',
      dob: '2026-08-01',
      count: 3,
    },
    {
      id: 'unknown-1',
      line: 'Arhgef-1',
      cage: '3',
      genotype: 'Unknown',
      sex: 'Unknown',
      dob: '2026-09-03',
      count: 1,
    },
    {
      id: 'wt-1',
      line: 'Arhgef-1',
      cage: '4',
      genotype: 'WT',
      sex: 'Female',
      dob: '2026-06-01',
      count: 1,
    },
    {
      id: 'archived-individual',
      line: 'Archived line',
      cage: '10',
      genotype: 'KO',
      sex: 'Male',
      dob: '2026-08-01',
      count: 10,
    },
  ],
  litters: [
    {
      id: 'litter-1',
      reference: 'ARH-B01-20260901',
      line: 'Arhgef-1',
      breedingCageId: 'breeding-1',
      breedingCageLabel: '1',
      dob: '2026-09-01',
      pupCount: 3,
      genotypeRequired: true,
      parents: [],
      pups: [
        { id: 'pup-1', tattooNumber: 1, genotype: 'Unknown', sex: 'Unknown', alive: true },
        { id: 'pup-2', tattooNumber: 2, genotype: 'Unknown', sex: 'Unknown', alive: true },
        { id: 'pup-3', tattooNumber: 3, genotype: 'WT', sex: 'Male', alive: true, transferredAt: '2026-09-09' },
      ],
      attachmentIds: [],
      createdAt: '2026-09-01T12:00:00.000Z',
      updatedAt: '2026-09-01T12:00:00.000Z',
    },
  ],
  work: [],
  protocols: [],
  archivedLines: ['Archived line'],
}

describe('genotype summary report', () => {
  it('summarizes active lines, mapped genotypes, pending pups, and attention items', () => {
    const report = buildGenotypeReport(data, new Date('2026-09-10T18:00:00.000Z'))

    expect(report.totals).toEqual({
      activeLines: 1,
      breedingCages: 1,
      individualCages: 3,
      individualMice: 5,
      pendingGenotypePups: 2,
    })
    expect(report.lines).toHaveLength(1)
    expect(report.lines[0]).toMatchObject({
      line: 'Arhgef-1',
      breedingCages: 1,
      pairings: [{ pairing: 'WT/WT', count: 1 }],
      individualCages: 3,
      individualMice: 5,
      pendingGenotypePups: 2,
      attention: {
        unknownGenotypeMice: 2,
        unknownSexMice: 1,
        incompleteMixedMapMice: 1,
      },
    })
    expect(report.lines[0].genotypeCounts).toMatchObject({ WT: 1, HET: 1, KO: 1, Unknown: 2 })
    expect(Object.values(report.lines[0].genotypeCounts).reduce((sum, count) => sum + count, 0)).toBe(report.lines[0].individualMice)
    expect(report.lines[0].sexCounts).toMatchObject({ Male: 3, Female: 1, Unknown: 1 })
    expect(report.lines[0].individualByAge).toEqual([
      { cage: '3', genotype: 'Unknown', sex: 'Unknown', dob: '2026-09-03', count: 1, age: '1 wk' },
      { cage: '2', genotype: 'Mixed', sex: 'Male', dob: '2026-08-01', count: 3, age: '1 mo 1 wk' },
      { cage: '4', genotype: 'WT', sex: 'Female', dob: '2026-06-01', count: 1, age: '3 mo 2 wk' },
    ])
    expect(report.lines[0].ageBuckets).toEqual([
      { id: 'underSixWeeks', label: '<6 weeks', count: 4 },
      { id: 'experimentReady', label: '6-8 weeks', count: 0 },
      { id: 'adultToSixMonths', label: '>8 weeks-6 months', count: 1 },
      { id: 'sixMonthsToOneYear', label: '6 months-1 year', count: 0 },
      { id: 'overOneYear', label: '>1 year', count: 0 },
    ])
  })

  it('uses a modern litter instead of double-counting its legacy breeding-cage pups', () => {
    const report = buildGenotypeReport(data, new Date('2026-09-10T18:00:00.000Z'))

    expect(report.lines[0].pendingSources).toEqual([
      { label: 'Litter ARH-B01-20260901', count: 2 },
    ])
  })

  it('serializes a stable plain-text report for clipboard and future email use', () => {
    const report = buildGenotypeReport(data, new Date('2026-09-10T18:00:00.000Z'))
    const text = serializeGenotypeReport(report)

    expect(text).toContain('TU Lab Colony - Genotype Summary')
    expect(text).toContain('Active lines: 1')
    expect(text).toContain('Arhgef-1')
    expect(text).toContain('Pairings: WT/WT: 1')
    expect(text).toContain('Inventory: WT 1 | HET 1 | KO 1 | Mixed 0 | Unknown 2')
    expect(text).toContain('Youngest to oldest: Cage 3 - 1 wk - Unknown - Unknown - 1 mouse')
    expect(text.indexOf('Cage 3 - 1 wk')).toBeLessThan(text.indexOf('Cage 4 - 3 mo 2 wk'))
    expect(text).toContain('Pending genotype: 2 pups')
    expect(text).toContain('Incomplete mixed map 1')
  })
})
