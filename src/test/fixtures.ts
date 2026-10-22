import type { BreedingCage, ColonyData, IndividualCage, WorkEntry } from '../types'
import type { LitterRecord } from '../domain/colony'

export const fixtureBreedingCage: BreedingCage = {
  id: 'breeding-rgs2-001',
  line: 'RGS2',
  cage: '1',
  pairing: 'HET/HET',
  maleGenotype: 'HET',
  maleDob: '2026-03-11',
  femaleGenotype: 'HET',
  femaleDob: '2026-02-28',
  genotypeNeeded: true,
  priority: true,
}

export const fixtureLitter: LitterRecord = {
  id: 'litter-rgs2-001',
  reference: 'RGS2-B01-20260601',
  line: 'RGS2',
  breedingCageId: fixtureBreedingCage.id,
  breedingCageLabel: fixtureBreedingCage.cage,
  dob: '2026-06-01',
  pupCount: 5,
  genotypeRequired: true,
  parents: [
    { sex: 'Male', genotype: fixtureBreedingCage.maleGenotype, dob: fixtureBreedingCage.maleDob },
    { sex: 'Female', genotype: fixtureBreedingCage.femaleGenotype, dob: fixtureBreedingCage.femaleDob },
  ],
  pups: Array.from({ length: 5 }, (_, index) => ({
    id: `pup-rgs2-001-${index + 1}`,
    tattooNumber: index + 1,
    genotype: 'Unknown',
    sex: 'Unknown',
    alive: true,
  })),
  attachmentIds: [],
  createdAt: '2026-06-01T09:00:00.000Z',
  updatedAt: '2026-06-01T09:00:00.000Z',
}

export const fixtureIndividualCage: IndividualCage = {
  id: 'individual-rgs2-001',
  line: 'RGS2',
  cage: 'RGS2-I001',
  genotype: 'KO',
  sex: 'Male',
  dob: '2026-02-28',
  count: 2,
}

export const fixtureWorkEntry: WorkEntry = {
  id: 'work-rgs2-001',
  line: 'RGS2',
  cage: '1',
  date: '2026-06-01',
  type: 'Pups born',
  description: 'New litter DOB 2026-06-01, count 5.',
  followUpDate: '2026-06-22',
}

export const fixtureColonyData: ColonyData = {
  breeding: [fixtureBreedingCage],
  individual: [fixtureIndividualCage],
  work: [fixtureWorkEntry],
  litters: [fixtureLitter],
  protocols: [],
}
