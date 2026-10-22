import { describe, expect, it } from 'vitest'
import type { ColonyData } from '../types'
import type { LitterRecord, PupRecord, WeanGroupDraft } from './colony'
import { fixtureColonyData, fixtureLitter } from '../test/fixtures'
import {
  getLitterStatus,
  litterDates,
  pairingRequiresGenotype,
  suggestWeanGroups,
  transferLitter,
  validateWeanTransfer,
} from './litterRules'

function pup(overrides: Partial<PupRecord> & { tattooNumber: number }): PupRecord {
  const { tattooNumber, ...rest } = overrides
  return {
    id: `pup-${tattooNumber}`,
    tattooNumber,
    genotype: 'Unknown',
    sex: 'Unknown',
    alive: true,
    ...rest,
  }
}

function litter(overrides: Partial<LitterRecord>): LitterRecord {
  return {
    ...fixtureLitter,
    pups: fixtureLitter.pups.map((item) => ({ ...item })),
    ...overrides,
  }
}

describe('litter date and genotype rules', () => {
  it('calculates genotype and wean dates from litter DOB', () => {
    expect(litterDates('2026-06-01')).toEqual({
      genotypeStart: '2026-06-05',
      genotypeEnd: '2026-06-12',
      weanDate: '2026-06-22',
    })
  })

  it('requires genotype for segregating pairings', () => {
    expect(pairingRequiresGenotype('HET', 'HET')).toBe(true)
    expect(pairingRequiresGenotype('WT', 'KO')).toBe(true)
    expect(pairingRequiresGenotype('WT', 'WT')).toBe(false)
    expect(pairingRequiresGenotype('KO', 'KO')).toBe(false)
  })
})

describe('litter status and transfer validation', () => {
  it('marks genotype-required litters due during the P4-P11 window', () => {
    expect(getLitterStatus(fixtureLitter, '2026-06-10')).toBe('genotype_due')
  })

  it('marks P21 litters with completed genotype but unknown sex as wean attention', () => {
    const subject = litter({
      pups: [
        pup({ tattooNumber: 1, genotype: 'KO', sex: 'Male' }),
        pup({ tattooNumber: 2, genotype: 'HET', sex: 'Unknown' }),
      ],
    })

    expect(getLitterStatus(subject, '2026-06-22')).toBe('wean_attention')
  })

  it('blocks transfer when any living pup has unknown sex', () => {
    const subject = litter({
      pups: [
        pup({ tattooNumber: 1, genotype: 'KO', sex: 'Male' }),
        pup({ tattooNumber: 2, genotype: 'HET', sex: 'Unknown' }),
      ],
    })
    const groups: WeanGroupDraft[] = [
      { id: 'group-1', sex: 'Male', cageSize: 'small', pupIds: ['pup-1'] },
    ]

    expect(validateWeanTransfer(subject, groups, '2026-06-22')).toContain('Every living pup needs a confirmed sex.')
  })

  it('blocks transfer when a pup appears in more than one group', () => {
    const subject = litter({
      pups: [
        pup({ tattooNumber: 1, genotype: 'KO', sex: 'Male' }),
        pup({ tattooNumber: 2, genotype: 'HET', sex: 'Male' }),
      ],
    })
    const groups: WeanGroupDraft[] = [
      { id: 'group-1', sex: 'Male', cageSize: 'small', pupIds: ['pup-1', 'pup-2'] },
      { id: 'group-2', sex: 'Male', cageSize: 'small', pupIds: ['pup-1'] },
    ]

    expect(validateWeanTransfer(subject, groups, '2026-06-22')).toContain('A pup can only appear in one wean group.')
  })
})

describe('wean grouping and transfer', () => {
  it('suggests sex-based groups for five or fewer living pups', () => {
    const subject = litter({
      pups: [
        pup({ tattooNumber: 1, genotype: 'KO', sex: 'Male' }),
        pup({ tattooNumber: 2, genotype: 'HET', sex: 'Male' }),
        pup({ tattooNumber: 3, genotype: 'WT', sex: 'Female' }),
        pup({ tattooNumber: 4, genotype: 'KO', sex: 'Female' }),
        pup({ tattooNumber: 5, genotype: 'HET', sex: 'Female' }),
      ],
    })

    expect(suggestWeanGroups(subject)).toEqual([
      { id: 'male-group-1', sex: 'Male', cageSize: 'small', pupIds: ['pup-1', 'pup-2'] },
      { id: 'female-group-1', sex: 'Female', cageSize: 'small', pupIds: ['pup-3', 'pup-4', 'pup-5'] },
    ])
  })

  it('suggests multiple capacity-safe groups for large litters', () => {
    const subject = litter({
      pupCount: 12,
      pups: Array.from({ length: 12 }, (_, index) => pup({
        tattooNumber: index + 1,
        genotype: 'HET',
        sex: index < 3 ? 'Male' : 'Female',
      })),
    })

    expect(suggestWeanGroups(subject)).toEqual([
      { id: 'male-group-1', sex: 'Male', cageSize: 'small', pupIds: ['pup-1', 'pup-2', 'pup-3'] },
      { id: 'female-group-1', sex: 'Female', cageSize: 'large', pupIds: ['pup-4', 'pup-5', 'pup-6', 'pup-7', 'pup-8', 'pup-9'] },
      { id: 'female-group-2', sex: 'Female', cageSize: 'small', pupIds: ['pup-10', 'pup-11', 'pup-12'] },
    ])
  })

  it('creates individual cages once and keeps repeated transfer idempotent', () => {
    const subject = litter({
      pups: [
        pup({ id: 'pup-rgs2-001-1', tattooNumber: 1, genotype: 'KO', sex: 'Male' }),
        pup({ id: 'pup-rgs2-001-2', tattooNumber: 2, genotype: 'HET', sex: 'Male' }),
        pup({ id: 'pup-rgs2-001-3', tattooNumber: 3, genotype: 'WT', sex: 'Female' }),
      ],
    })
    const data: ColonyData = { ...fixtureColonyData, litters: [subject], individual: [] }
    const groups: WeanGroupDraft[] = [
      { id: 'group-1', sex: 'Male', cageSize: 'small', pupIds: ['pup-rgs2-001-1', 'pup-rgs2-001-2'] },
      { id: 'group-2', sex: 'Female', cageSize: 'small', pupIds: ['pup-rgs2-001-3'] },
    ]

    const first = transferLitter(data, subject.id, groups, '2026-06-22')
    const second = transferLitter(first, subject.id, groups, '2026-06-22')

    expect(first.individual).toHaveLength(2)
    expect(second.individual).toHaveLength(2)
    expect(second.individual.map((cage) => cage.cage)).toEqual(['RGS2-I001', 'RGS2-I002'])
    expect(second.individual[0].genotypeMap).toBe('#1 KO; #2 HET')
  })
})
