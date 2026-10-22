import { addDays, format, isBefore, parseISO } from 'date-fns'
import type { ColonyData, Genotype, IndividualCage } from '../types'
import type { LitterRecord, LitterStatus, PupRecord, WeanGroupDraft } from './colony'

export function litterDates(dob: string) {
  const parsed = parseISO(dob)
  return {
    genotypeStart: format(addDays(parsed, 4), 'yyyy-MM-dd'),
    genotypeEnd: format(addDays(parsed, 11), 'yyyy-MM-dd'),
    weanDate: format(addDays(parsed, 21), 'yyyy-MM-dd'),
  }
}

export function pairingRequiresGenotype(maleGenotype: string, femaleGenotype: string) {
  const male = normalizeGenotype(maleGenotype)
  const female = normalizeGenotype(femaleGenotype)
  return !(male === female && (male === 'WT' || male === 'KO'))
}

export function getLitterStatus(litter: LitterRecord, today: string): LitterStatus {
  const living = livingPups(litter)
  if (!living.length) return 'closed'
  if (living.every((pup) => pup.transferredAt)) return 'weaned'

  const dates = litterDates(litter.dob)
  const isP21 = !isBefore(parseISO(today), parseISO(dates.weanDate))
  const hasAnyResult = living.some((pup) => pup.genotype !== 'Unknown')
  const genotypeComplete = !litter.genotypeRequired || living.every((pup) => pup.genotype !== 'Unknown')
  const sexComplete = living.every((pup) => pup.sex !== 'Unknown')

  if (isP21 && (!genotypeComplete || !sexComplete)) return 'wean_attention'
  if (isP21 && genotypeComplete && sexComplete) return 'ready_to_wean'
  if (litter.genotypeRequired && genotypeComplete && !sexComplete) return 'awaiting_sex'
  if (litter.genotypeRequired && hasAnyResult) return 'genotype_in_progress'
  if (litter.genotypeRequired && !isBefore(parseISO(today), parseISO(dates.genotypeStart))) return 'genotype_due'
  return 'new'
}

export function validateWeanTransfer(litter: LitterRecord, groups: WeanGroupDraft[], transferDate: string) {
  const errors: string[] = []
  const dates = litterDates(litter.dob)
  const living = livingPups(litter)
  const livingIds = new Set(living.map((pup) => pup.id))
  const placementCounts = new Map<string, number>()

  if (isBefore(parseISO(transferDate), parseISO(dates.weanDate))) {
    errors.push('Pups cannot move to individual cages before P21 without an early-wean correction.')
  }

  if (living.some((pup) => pup.sex === 'Unknown')) {
    errors.push('Every living pup needs a confirmed sex.')
  }

  if (living.some((pup) => pup.transferredAt)) {
    errors.push('Transferred pups cannot be transferred again.')
  }

  groups.forEach((group) => {
    const capacity = group.cageSize === 'small' ? 3 : 6
    if (group.pupIds.length > capacity) {
      errors.push(`${group.cageSize === 'small' ? 'Small' : 'Large'} cage capacity is ${capacity} mice.`)
    }

    group.pupIds.forEach((pupId) => {
      placementCounts.set(pupId, (placementCounts.get(pupId) ?? 0) + 1)
      const pup = living.find((item) => item.id === pupId)
      if (!pup) errors.push('Every wean group pup must belong to this active litter.')
      if (pup && pup.sex !== 'Unknown' && pup.sex !== group.sex) {
        errors.push('Pup sex must match the assigned wean group sex.')
      }
    })
  })

  if ([...placementCounts.values()].some((count) => count > 1)) {
    errors.push('A pup can only appear in one wean group.')
  }

  const placedLivingIds = [...placementCounts.keys()].filter((pupId) => livingIds.has(pupId))
  if (placedLivingIds.length !== living.length) {
    errors.push('Every living pup must be assigned to a wean group.')
  }

  return unique(errors)
}

export function suggestWeanGroups(litter: LitterRecord): WeanGroupDraft[] {
  const living = livingPups(litter)
  if (living.some((pup) => pup.sex === 'Unknown')) return []

  return (['Male', 'Female'] as const).flatMap((sex) => {
    const pupIds = living.filter((pup) => pup.sex === sex).map((pup) => pup.id)
    return chunkForCages(pupIds).map((chunk, index) => ({
      id: `${sex.toLowerCase()}-group-${index + 1}`,
      sex,
      cageSize: cageSizeFor(chunk.length),
      pupIds: chunk,
    }))
  })
}

export function transferLitter(
  data: ColonyData,
  litterId: string,
  groups: WeanGroupDraft[],
  transferDate: string,
): ColonyData {
  const litter = data.litters.find((item) => item.id === litterId)
  if (!litter) return data

  const alreadyTransferred = livingPups(litter).some((pup) => pup.transferredAt)
  if (alreadyTransferred) return data

  const errors = validateWeanTransfer(litter, groups, transferDate)
  if (errors.length) {
    throw new Error(errors.join('\n'))
  }

  const nextCageNumber = nextIndividualCageNumber(data.individual, litter.line)
  const createdCages = groups.map((group, index) => createIndividualCage(litter, group, nextCageNumber + index))
  const groupByPup = new Map<string, string>()
  createdCages.forEach((cage) => {
    cage.sourcePupIds?.forEach((pupId) => groupByPup.set(pupId, cage.id))
  })

  const litters = data.litters.map((item) => {
    if (item.id !== litterId) return item
    return {
      ...item,
      pups: item.pups.map((pup) => groupByPup.has(pup.id)
        ? { ...pup, transferredAt: transferDate, individualCageId: groupByPup.get(pup.id) }
        : pup),
      updatedAt: `${transferDate}T09:00:00.000Z`,
    }
  })

  return {
    ...data,
    litters,
    individual: [...data.individual, ...createdCages],
  }
}

function createIndividualCage(litter: LitterRecord, group: WeanGroupDraft, cageNumber: number): IndividualCage {
  const pups = group.pupIds
    .map((pupId) => litter.pups.find((pup) => pup.id === pupId))
    .filter((pup): pup is PupRecord => Boolean(pup))
    .sort((a, b) => a.tattooNumber - b.tattooNumber)
  const genotypeValues = unique(pups.map((pup) => genotypeLabel(pup)))
  const cage = `${litter.line}-I${String(cageNumber).padStart(3, '0')}`

  return {
    id: `individual-${litter.id}-${group.id}`,
    line: litter.line,
    cage,
    genotype: genotypeValues.length === 1 ? toInventoryGenotype(genotypeValues[0]) : 'Mixed',
    sex: group.sex,
    dob: litter.dob,
    count: pups.length,
    genotypeMap: pups.map((pup) => `#${pup.tattooNumber} ${genotypeLabel(pup)}`).join('; '),
    notes: `Source litter ${litter.reference}; breeding cage ${litter.breedingCageLabel}`,
    sourceLitterId: litter.id,
    sourcePupIds: pups.map((pup) => pup.id),
  }
}

function livingPups(litter: LitterRecord) {
  return litter.pups.filter((pup) => pup.alive)
}

function normalizeGenotype(value: string) {
  return value.trim().toUpperCase()
}

function cageSizeFor(count: number) {
  return count <= 3 ? 'small' : 'large'
}

function chunkForCages(pupIds: string[]) {
  const chunks: string[][] = []
  let remaining = [...pupIds]

  while (remaining.length > 0) {
    const size = remaining.length <= 3 ? remaining.length : Math.min(6, remaining.length)
    chunks.push(remaining.slice(0, size))
    remaining = remaining.slice(size)
  }

  return chunks
}

function nextIndividualCageNumber(cages: IndividualCage[], line: string) {
  const prefix = `${line}-I`
  const existing = cages
    .filter((cage) => cage.line === line && cage.cage.startsWith(prefix))
    .map((cage) => Number(cage.cage.slice(prefix.length)))
    .filter(Number.isFinite)
  return existing.length ? Math.max(...existing) + 1 : 1
}

function genotypeLabel(pup: PupRecord) {
  return pup.genotype === 'Custom' ? pup.customGenotype || 'Custom' : pup.genotype
}

function toInventoryGenotype(value: string): Genotype {
  return value === 'WT' || value === 'HET' || value === 'KO' ? value : 'Unknown'
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values))
}
