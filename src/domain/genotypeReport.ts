import { differenceInWeeks, format, parseISO } from 'date-fns'
import type { ColonyData, Genotype, IndividualCage, Sex } from '../types'
import { genotypeCountEntries, individualAgeSexSummary, type IndividualAgeBucketId } from '../utils'
import { getActiveColonyLines } from './colonyLines'

const genotypes: Genotype[] = ['WT', 'HET', 'KO', 'RGS2 WT', 'Prex KO', 'Mixed', 'Unknown']
const sexes: Sex[] = ['Male', 'Female', 'Mixed', 'Unknown']

export interface GenotypeReportTotals {
  activeLines: number
  breedingCages: number
  individualCages: number
  individualMice: number
  pendingGenotypePups: number
}

export interface GenotypeReportLine {
  line: string
  breedingCages: number
  pairings: Array<{ pairing: string; count: number }>
  individualCages: number
  individualMice: number
  genotypeCounts: Record<Genotype, number>
  sexCounts: Record<Sex, number>
  individualByAge: Array<{
    cage: string
    genotype: Genotype
    sex: Sex
    dob: string
    count: number
    age: string
  }>
  ageBuckets: Array<{
    id: IndividualAgeBucketId
    label: string
    count: number
  }>
  pendingGenotypePups: number
  pendingSources: Array<{ label: string; count: number }>
  attention: {
    unknownGenotypeMice: number
    unknownSexMice: number
    incompleteMixedMapMice: number
  }
}

export interface GenotypeReport {
  generatedAt: string
  totals: GenotypeReportTotals
  lines: GenotypeReportLine[]
}

function emptyGenotypeCounts(): Record<Genotype, number> {
  return Object.fromEntries(genotypes.map((value) => [value, 0])) as Record<Genotype, number>
}

function emptySexCounts(): Record<Sex, number> {
  return Object.fromEntries(sexes.map((value) => [value, 0])) as Record<Sex, number>
}

function ageAt(dob: string, generatedAt: Date) {
  const weeks = Math.max(0, differenceInWeeks(generatedAt, parseISO(dob)))
  if (weeks < 4) return `${weeks} wk`
  return `${Math.floor(weeks / 4)} mo ${weeks % 4} wk`
}

function reportGenotypeEntries(cage: IndividualCage): Array<[Genotype, number]> {
  const entries = genotypeCountEntries(cage)
  if (cage.genotype !== 'Mixed') return entries

  const mapped = entries.reduce((sum, [, count]) => sum + count, 0)
  if (mapped > cage.count) return [['Mixed', cage.count]]
  if (mapped < cage.count) return [...entries, ['Unknown', cage.count - mapped]]
  return entries
}

export function buildGenotypeReport(data: ColonyData, generatedAt: Date): GenotypeReport {
  const activeLines = getActiveColonyLines(data).sort((a, b) => a.localeCompare(b))
  const activeLineSet = new Set(activeLines)

  const lines = activeLines.map((line): GenotypeReportLine => {
    const breeding = data.breeding.filter((cage) => cage.line === line)
    const individual = data.individual.filter((cage) => cage.line === line)
    const modernLitters = data.litters.filter((litter) => litter.line === line)
    const modernBreedingIds = new Set(modernLitters.map((litter) => litter.breedingCageId))
    const genotypeCounts = emptyGenotypeCounts()
    const sexCounts = emptySexCounts()

    individual.forEach((cage) => {
      sexCounts[cage.sex] += cage.count
      reportGenotypeEntries(cage).forEach(([value, count]) => {
        genotypeCounts[value] += count
      })
    })

    const pairingCounts = new Map<string, number>()
    breeding.forEach((cage) => {
      const pairing = `${cage.maleGenotype}/${cage.femaleGenotype}`
      pairingCounts.set(pairing, (pairingCounts.get(pairing) ?? 0) + 1)
    })

    const pendingSources = modernLitters.flatMap((litter) => {
      if (!litter.genotypeRequired) return []
      const count = litter.pups.filter((pup) => pup.alive && !pup.transferredAt).length
      return count ? [{ label: `Litter ${litter.reference}`, count }] : []
    })

    breeding.forEach((cage) => {
      if (!cage.genotypeNeeded || !cage.pupsCount || modernBreedingIds.has(cage.id)) return
      pendingSources.push({ label: `Breeding cage ${cage.cage}`, count: cage.pupsCount })
    })

    const incompleteMixedMapMice = individual.reduce((sum, cage) => {
      if (cage.genotype !== 'Mixed') return sum
      if (!cage.genotypeMap) return sum + cage.count
      const mapped = genotypeCountEntries(cage).reduce((total, [, count]) => total + count, 0)
      return sum + Math.max(0, cage.count - mapped)
    }, 0)

    return {
      line,
      breedingCages: breeding.length,
      pairings: Array.from(pairingCounts, ([pairing, count]) => ({ pairing, count }))
        .sort((a, b) => a.pairing.localeCompare(b.pairing)),
      individualCages: individual.length,
      individualMice: individual.reduce((sum, cage) => sum + cage.count, 0),
      genotypeCounts,
      sexCounts,
      individualByAge: individual
        .map((cage) => ({
          cage: cage.cage,
          genotype: cage.genotype,
          sex: cage.sex,
          dob: cage.dob,
          count: cage.count,
          age: ageAt(cage.dob, generatedAt),
        }))
        .sort((a, b) => b.dob.localeCompare(a.dob) || a.cage.localeCompare(b.cage, undefined, { numeric: true })),
      ageBuckets: individualAgeSexSummary(individual, format(generatedAt, 'yyyy-MM-dd'))
        .map((bucket) => ({ id: bucket.id, label: bucket.label, count: bucket.total })),
      pendingGenotypePups: pendingSources.reduce((sum, source) => sum + source.count, 0),
      pendingSources,
      attention: {
        unknownGenotypeMice: genotypeCounts.Unknown,
        unknownSexMice: sexCounts.Unknown,
        incompleteMixedMapMice,
      },
    }
  })

  const activeBreeding = data.breeding.filter((cage) => activeLineSet.has(cage.line))
  const activeIndividual = data.individual.filter((cage) => activeLineSet.has(cage.line))

  return {
    generatedAt: generatedAt.toISOString(),
    totals: {
      activeLines: activeLines.length,
      breedingCages: activeBreeding.length,
      individualCages: activeIndividual.length,
      individualMice: activeIndividual.reduce((sum, cage) => sum + cage.count, 0),
      pendingGenotypePups: lines.reduce((sum, line) => sum + line.pendingGenotypePups, 0),
    },
    lines,
  }
}

export function serializeGenotypeReport(report: GenotypeReport): string {
  const header = [
    'TU Lab Colony - Genotype Summary',
    `Generated: ${format(new Date(report.generatedAt), 'MMM d, yyyy, h:mm a')}`,
    '',
    'COLONY TOTALS',
    `Active lines: ${report.totals.activeLines}`,
    `Breeding cages: ${report.totals.breedingCages}`,
    `Individual cages: ${report.totals.individualCages}`,
    `Individual mice: ${report.totals.individualMice}`,
    `Pending genotype: ${report.totals.pendingGenotypePups} pups`,
  ]

  const sections = report.lines.flatMap((line) => {
    const inventoryOrder: Genotype[] = ['WT', 'HET', 'KO', 'RGS2 WT', 'Prex KO', 'Mixed', 'Unknown']
    const inventory = inventoryOrder
      .filter((value) => ['WT', 'HET', 'KO', 'Mixed', 'Unknown'].includes(value) || line.genotypeCounts[value] > 0)
      .map((value) => `${value} ${line.genotypeCounts[value]}`)
      .join(' | ')
    const attention = [
      `Unknown genotype ${line.attention.unknownGenotypeMice}`,
      `Unknown sex ${line.attention.unknownSexMice}`,
      `Incomplete mixed map ${line.attention.incompleteMixedMapMice}`,
    ].join('; ')
    const ageInventory = line.individualByAge.length
      ? line.individualByAge.map((item, index) => {
          const mice = `${item.count} ${item.count === 1 ? 'mouse' : 'mice'}`
          const entry = `Cage ${item.cage} - ${item.age} - ${item.genotype} - ${item.sex} - ${mice} - DOB ${item.dob}`
          return `${index === 0 ? 'Youngest to oldest: ' : '  '}${entry}`
        })
      : ['Youngest to oldest: None']

    return [
      '',
      line.line,
      `Breeding: ${line.breedingCages} ${line.breedingCages === 1 ? 'cage' : 'cages'}`,
      `Pairings: ${line.pairings.length ? line.pairings.map((item) => `${item.pairing}: ${item.count}`).join(' | ') : 'None'}`,
      `Inventory: ${inventory}`,
      `Sex: Male ${line.sexCounts.Male} | Female ${line.sexCounts.Female} | Mixed ${line.sexCounts.Mixed} | Unknown ${line.sexCounts.Unknown}`,
      ...ageInventory,
      `Pending genotype: ${line.pendingGenotypePups} pups`,
      `Attention: ${attention}`,
    ]
  })

  return [...header, ...sections].join('\n')
}
