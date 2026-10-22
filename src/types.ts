import type { LitterRecord } from './domain/colony'

export type Genotype = 'WT' | 'HET' | 'KO' | 'RGS2 WT' | 'Prex KO' | 'Mixed' | 'Unknown'
export type Sex = 'Male' | 'Female' | 'Mixed' | 'Unknown'

export interface BreedingCage {
  id: string
  line: string
  cage: string
  pairing: string
  maleGenotype: Genotype
  maleDob: string
  femaleGenotype: Genotype
  femaleDob: string
  extraFemale?: string
  pupsDob?: string
  pupsCount?: number
  genotypeNeeded?: boolean
  priority?: boolean
  notes?: string
  customFields?: Record<string, string>
}

export interface IndividualCage {
  id: string
  line: string
  cage: string
  genotype: Genotype
  sex: Sex
  dob: string
  count: number
  genotypeMap?: string
  notes?: string
  sourceLitterId?: string
  sourcePupIds?: string[]
  customFields?: Record<string, string>
}

export interface WorkEntry {
  id: string
  line: string
  cage: string
  date: string
  type: string
  description: string
  followUpDate?: string
  attachmentIds?: string[]
  attachments?: import('./domain/colony').LitterAttachmentMetadata[]
}

export interface GenotypeProtocol {
  id: string
  line: string
  name: string
  targetGene?: string
  primers: string
  pcrReactionSystem?: string
  pcrProgram: string
  expectedBands?: string
  notes?: string
  attachmentIds?: string[]
  attachments?: import('./domain/colony').LitterAttachmentMetadata[]
  updatedAt: string
}

export interface ColonyData {
  breeding: BreedingCage[]
  individual: IndividualCage[]
  work: WorkEntry[]
  litters: LitterRecord[]
  protocols: GenotypeProtocol[]
  archivedLines?: string[]
}
