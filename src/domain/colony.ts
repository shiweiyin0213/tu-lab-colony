import type { Genotype, Sex } from '../types'

export type BasicGenotype = 'WT' | 'HET' | 'KO'
export type PupGenotype = BasicGenotype | 'Inconclusive' | 'Rerun required' | 'Custom' | 'Unknown'
export type PupSex = 'Male' | 'Female' | 'Unknown'
export type LitterStatus =
  | 'new'
  | 'genotype_due'
  | 'genotype_in_progress'
  | 'awaiting_sex'
  | 'ready_to_wean'
  | 'wean_attention'
  | 'weaned'
  | 'closed'
export type CageSize = 'small' | 'large'

export interface ParentSnapshot {
  sex: 'Male' | 'Female'
  genotype: string
  dob: string
}

export interface PupRecord {
  id: string
  tattooNumber: number
  genotype: PupGenotype
  customGenotype?: string
  sex: PupSex
  notes?: string
  alive: boolean
  transferredAt?: string
  individualCageId?: string
}

export interface LitterRecord {
  id: string
  reference: string
  line: string
  breedingCageId: string
  breedingCageLabel: string
  dob: string
  pupCount: number
  genotypeRequired: boolean
  genotypeOverride?: boolean
  parents: ParentSnapshot[]
  pups: PupRecord[]
  gelRunDate?: string
  assayNotes?: string
  attachmentIds: string[]
  attachments?: LitterAttachmentMetadata[]
  createdAt: string
  updatedAt: string
}

export interface WeanGroupDraft {
  id: string
  sex: Exclude<PupSex, 'Unknown'>
  cageSize: CageSize
  pupIds: string[]
  physicalLabel?: string
}

export interface LitterAttachmentMetadata {
  id: string
  category: 'gel-image' | 'breeding-card' | 'individual-card' | 'euthanasia-evidence' | 'genotype-protocol' | 'other'
  originalName: string
  mimeType: string
  byteSize: number
  uploaderLabel: string
  createdAt: string
}

export interface LegacyIndividualSource {
  sourceLitterId?: string
  sourcePupIds?: string[]
}

export interface IndividualCageFromLitter {
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
}
