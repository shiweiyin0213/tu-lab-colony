import { describe, expect, it } from 'vitest'
import type { LitterRecord } from './domain/colony'
import { ageLabel, buildReminderEvents, individualAgeSexSummary } from './utils'
import { fixtureLitter } from './test/fixtures'

function litter(overrides: Partial<LitterRecord>): LitterRecord {
  return {
    ...fixtureLitter,
    pups: fixtureLitter.pups.map((pup) => ({ ...pup })),
    ...overrides,
  }
}

describe('calendar reminder events', () => {
  it('exports P4 genotype and P21 wean reminders for genotype-required litters', () => {
    const events = buildReminderEvents([], [fixtureLitter], '2026-06-01')

    expect(events.map((event) => event.title)).toEqual([
      'Wean RGS2 litter RGS2-B01-20260601',
      'Genotype RGS2 litter RGS2-B01-20260601',
    ])
  })

  it('exports only P21 reminders for fixed-genotype litters', () => {
    const events = buildReminderEvents([], [litter({ genotypeRequired: false })], '2026-06-01')

    expect(events.map((event) => event.title)).toEqual(['Wean RGS2 litter RGS2-B01-20260601'])
  })

  it('does not export future wean reminders after all living pups transferred', () => {
    const transferred = litter({
      pups: fixtureLitter.pups.map((pup) => ({ ...pup, transferredAt: '2026-06-22' })),
    })

    expect(buildReminderEvents([], [transferred], '2026-06-01')).toEqual([])
  })
})

describe('individual age and sex summaries', () => {
  it('formats Arhgef-25 individual ages in total weeks and keeps other lines in months and weeks', () => {
    const current = new Date('2026-06-20T12:00:00')

    expect(ageLabel('2026-05-01', 'Arhgef-25', current)).toBe('7 wk')
    expect(ageLabel('2026-05-01', 'RGS2', current)).toBe('1 mo 3 wk')
  })

  it('counts grouped mouse numbers before one genotype in mixed cages', () => {
    const summary = individualAgeSexSummary([
      { id: 'grouped-ko', line: 'Arhgef-25', cage: '23', genotype: 'Mixed', sex: 'Male', dob: '2026-05-23', count: 2, genotypeMap: '#1 #4 KO' },
    ], '2026-06-20')

    expect(summary.find((bucket) => bucket.id === 'underSixWeeks')).toMatchObject({
      total: 2,
      genotypeSexCounts: {
        KO: { Male: 2, Female: 0, Mixed: 0, Unknown: 0 },
        Unknown: { Male: 0, Female: 0, Mixed: 0, Unknown: 0 },
      },
    })
  })

  it('counts tattoo genotype maps without semicolons or strict spacing', () => {
    const summary = individualAgeSexSummary([
      { id: 'loose-map', line: 'RGS2', cage: '7', genotype: 'Mixed', sex: 'Male', dob: '2026-05-23', count: 2, genotypeMap: '#2 KO #3 HET' },
      { id: 'tight-map', line: 'RGS2', cage: '8', genotype: 'Mixed', sex: 'Female', dob: '2026-05-23', count: 2, genotypeMap: '#4KO # 5 WT' },
    ], '2026-06-20')

    expect(summary.find((bucket) => bucket.id === 'underSixWeeks')).toMatchObject({
      total: 4,
      genotypeSexCounts: {
        WT: { Male: 0, Female: 1, Mixed: 0, Unknown: 0 },
        HET: { Male: 1, Female: 0, Mixed: 0, Unknown: 0 },
        KO: { Male: 1, Female: 1, Mixed: 0, Unknown: 0 },
        Unknown: { Male: 0, Female: 0, Mixed: 0, Unknown: 0 },
      },
    })
  })

  it('does not invent unknown genotype counts when a mixed cage map is partial', () => {
    const summary = individualAgeSexSummary([
      { id: 'arhgef1-partial-map', line: 'Arhgef-1', cage: '14', genotype: 'Mixed', sex: 'Male', dob: '2026-05-23', count: 3, genotypeMap: '#2 KO #3 HET' },
    ], '2026-06-20')

    expect(summary.find((bucket) => bucket.id === 'underSixWeeks')).toMatchObject({
      total: 3,
      genotypeSexCounts: {
        HET: { Male: 1, Female: 0, Mixed: 0, Unknown: 0 },
        KO: { Male: 1, Female: 0, Mixed: 0, Unknown: 0 },
        Unknown: { Male: 0, Female: 0, Mixed: 0, Unknown: 0 },
      },
    })
  })

  it('groups individual mice into age buckets with genotype-by-sex counts', () => {
    const summary = individualAgeSexSummary([
      { id: 'young-wt-male', line: 'Arhgef-25', cage: '1', genotype: 'WT', sex: 'Male', dob: '2026-06-01', count: 2 },
      { id: 'young-ko-female', line: 'Arhgef-25', cage: '2', genotype: 'KO', sex: 'Female', dob: '2026-05-17', count: 3 },
      { id: 'young-mixed-male', line: 'Arhgef-25', cage: '20', genotype: 'Mixed', sex: 'Male', dob: '2026-05-20', count: 3, genotypeMap: '#1 KO; #2 HET; #3 WT' },
      { id: 'ready-het-male', line: 'Arhgef-25', cage: '3', genotype: 'HET', sex: 'Male', dob: '2026-05-04', count: 1 },
      { id: 'ready-wt-female', line: 'Arhgef-25', cage: '4', genotype: 'WT', sex: 'Female', dob: '2026-05-01', count: 2 },
      { id: 'adult-ko-male', line: 'Arhgef-25', cage: '5', genotype: 'KO', sex: 'Male', dob: '2026-03-01', count: 4 },
      { id: 'six-month-het-female', line: 'Arhgef-25', cage: '6', genotype: 'HET', sex: 'Female', dob: '2025-12-01', count: 5 },
      { id: 'year-female', line: 'Arhgef-25', cage: '4', genotype: 'WT', sex: 'Female', dob: '2025-05-01', count: 4 },
    ], '2026-06-20')

    expect(summary.map((bucket) => bucket.label)).toEqual(['<6 weeks', '6-8 weeks', '>8 weeks-6 months', '6 months-1 year', '>1 year'])
    expect(summary.find((bucket) => bucket.id === 'underSixWeeks')).toMatchObject({
      total: 8,
      genotypeSexCounts: {
        WT: { Male: 3, Female: 0, Mixed: 0, Unknown: 0 },
        HET: { Male: 1, Female: 0, Mixed: 0, Unknown: 0 },
        KO: { Male: 1, Female: 3, Mixed: 0, Unknown: 0 },
        Mixed: { Male: 0, Female: 0, Mixed: 0, Unknown: 0 },
      },
    })
    expect(summary.find((bucket) => bucket.id === 'experimentReady')).toMatchObject({
      total: 3,
      genotypeSexCounts: {
        WT: { Male: 0, Female: 2, Mixed: 0, Unknown: 0 },
        HET: { Male: 1, Female: 0, Mixed: 0, Unknown: 0 },
      },
    })
    expect(summary.find((bucket) => bucket.id === 'adultToSixMonths')).toMatchObject({
      total: 4,
      genotypeSexCounts: {
        KO: { Male: 4, Female: 0, Mixed: 0, Unknown: 0 },
      },
    })
    expect(summary.find((bucket) => bucket.id === 'sixMonthsToOneYear')).toMatchObject({
      total: 5,
      genotypeSexCounts: {
        HET: { Male: 0, Female: 5, Mixed: 0, Unknown: 0 },
      },
    })
    expect(summary.find((bucket) => bucket.id === 'overOneYear')).toMatchObject({
      total: 4,
      genotypeSexCounts: {
        WT: { Male: 0, Female: 4, Mixed: 0, Unknown: 0 },
      },
    })
  })
})
