import { describe, expect, it } from 'vitest'
import { buildImportProfile } from './importProfile'
import type { IndividualCage } from '../types'

describe('import profile builder', () => {
  it('discovers custom categorical fields for personalized dashboard sections', () => {
    const rows: IndividualCage[] = [
      { id: 'i-1', line: 'Hearing Lab', cage: '1', genotype: 'WT', sex: 'Male', dob: '2026-05-01', count: 2, customFields: { 'Hearing status': 'Normal', Cohort: 'ABR baseline' } },
      { id: 'i-2', line: 'Hearing Lab', cage: '2', genotype: 'KO', sex: 'Female', dob: '2026-05-01', count: 1, customFields: { 'Hearing status': 'Impaired', Cohort: 'ABR baseline' } },
      { id: 'i-3', line: 'Hearing Lab', cage: '3', genotype: 'HET', sex: 'Female', dob: '2026-05-01', count: 3, customFields: { 'Hearing status': 'Normal', Cohort: 'Drug arm' } },
    ]

    const profile = buildImportProfile(rows)

    expect(profile).toMatchObject({
      fields: [
        { name: 'Hearing status', total: 6, values: [{ label: 'Normal', count: 5 }, { label: 'Impaired', count: 1 }] },
        { name: 'Cohort', total: 6, values: [{ label: 'ABR baseline', count: 3 }, { label: 'Drug arm', count: 3 }] },
      ],
    })
    expect(profile.sidebarFilters).toEqual(['Hearing status', 'Cohort'])
  })
})
