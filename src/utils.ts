import { addDays, differenceInCalendarDays, differenceInMonths, differenceInWeeks, format, isAfter, isBefore, isEqual, parseISO } from 'date-fns'
import type { BreedingCage, Genotype, IndividualCage, Sex } from './types'
import type { LitterRecord } from './domain/colony'
import { litterDates } from './domain/litterRules'

export const today = new Date()

export function ageLabel(value: string, line?: string, current = today) {
  const weeks = Math.max(0, differenceInWeeks(current, parseISO(value)))
  if (line === 'Arhgef-25') return `${weeks} wk`
  if (weeks < 4) return `${weeks} wk`
  return `${Math.floor(weeks / 4)} mo ${weeks % 4} wk`
}

export function weanDate(cage: BreedingCage) {
  return cage.pupsDob ? addDays(parseISO(cage.pupsDob), 21) : null
}

export function genotypeWindow(cage: BreedingCage) {
  if (!cage.pupsDob || !cage.genotypeNeeded) return null
  return [addDays(parseISO(cage.pupsDob), 7), addDays(parseISO(cage.pupsDob), 11)] as const
}

export function weanStatus(cage: BreedingCage) {
  const due = weanDate(cage)
  if (!due) return { label: 'No litter', tone: 'muted' }
  const days = differenceInCalendarDays(due, today)
  if (days < 0) return { label: 'Weaned / past P21', tone: 'done' }
  if (days === 0) return { label: 'Due today', tone: 'urgent' }
  if (days <= 3) return { label: `Due in ${days}d`, tone: 'warning' }
  return { label: format(due, 'MMM d'), tone: 'scheduled' }
}

export function breederAlert(dob: string) {
  return differenceInWeeks(today, parseISO(dob)) >= 52
}

export type IndividualAgeBucketId = 'underSixWeeks' | 'experimentReady' | 'adultToSixMonths' | 'sixMonthsToOneYear' | 'overOneYear'

export interface IndividualAgeBucket {
  id: IndividualAgeBucketId
  label: string
  detail: string
  total: number
  sexCounts: Record<Sex, number>
  genotypeCounts: Record<Genotype, number>
  genotypeSexCounts: Record<Genotype, Record<Sex, number>>
}

const emptySexCounts = (): Record<Sex, number> => ({
  Male: 0,
  Female: 0,
  Mixed: 0,
  Unknown: 0,
})

const emptyGenotypeCounts = (): Record<Genotype, number> => ({
  WT: 0,
  HET: 0,
  KO: 0,
  'RGS2 WT': 0,
  'Prex KO': 0,
  Mixed: 0,
  Unknown: 0,
})

const emptyGenotypeSexCounts = (): Record<Genotype, Record<Sex, number>> => ({
  WT: emptySexCounts(),
  HET: emptySexCounts(),
  KO: emptySexCounts(),
  'RGS2 WT': emptySexCounts(),
  'Prex KO': emptySexCounts(),
  Mixed: emptySexCounts(),
  Unknown: emptySexCounts(),
})

export function genotypeCountEntries(cage: IndividualCage): Array<[Genotype, number]> {
  if (cage.genotype !== 'Mixed' || !cage.genotypeMap) return [[cage.genotype, cage.count]]

  const counts = emptyGenotypeCounts()
  const matches = cage.genotypeMap.matchAll(/((?:#\s*\d+\s*)+)\s*(RGS2\s*WT|Prex\s*KO|WT|HET|KO|Unknown)\b/gi)
  Array.from(matches).forEach((match) => {
    const mouseCount = Array.from(match[1].matchAll(/#\s*\d+/g)).length
    const genotype = normalizeMappedGenotype(match[2])
    counts[genotype] += mouseCount
  })

  const entries = Object.entries(counts).filter(([, count]) => count > 0) as Array<[Genotype, number]>
  const parsedCount = entries.reduce((sum, [, count]) => sum + count, 0)
  if (!parsedCount) return [['Unknown', cage.count]]
  return entries
}

function normalizeMappedGenotype(value: string): Genotype {
  const normalized = value.toUpperCase().replace(/\s+/g, ' ').trim()
  if (normalized === 'RGS2 WT') return 'RGS2 WT'
  if (normalized === 'PREX KO') return 'Prex KO'
  if (normalized === 'WT' || normalized === 'HET' || normalized === 'KO') return normalized
  return 'Unknown'
}

export function individualAgeSexSummary(cages: IndividualCage[], todayIso = format(today, 'yyyy-MM-dd')): IndividualAgeBucket[] {
  const buckets: IndividualAgeBucket[] = [
    { id: 'underSixWeeks', label: '<6 weeks', detail: 'Growing / genotype window', total: 0, sexCounts: emptySexCounts(), genotypeCounts: emptyGenotypeCounts(), genotypeSexCounts: emptyGenotypeSexCounts() },
    { id: 'experimentReady', label: '6-8 weeks', detail: 'Experiment-ready', total: 0, sexCounts: emptySexCounts(), genotypeCounts: emptyGenotypeCounts(), genotypeSexCounts: emptyGenotypeSexCounts() },
    { id: 'adultToSixMonths', label: '>8 weeks-6 months', detail: 'Young adult reserve', total: 0, sexCounts: emptySexCounts(), genotypeCounts: emptyGenotypeCounts(), genotypeSexCounts: emptyGenotypeSexCounts() },
    { id: 'sixMonthsToOneYear', label: '6 months-1 year', detail: 'Mature adults', total: 0, sexCounts: emptySexCounts(), genotypeCounts: emptyGenotypeCounts(), genotypeSexCounts: emptyGenotypeSexCounts() },
    { id: 'overOneYear', label: '>1 year', detail: 'Consider retirement', total: 0, sexCounts: emptySexCounts(), genotypeCounts: emptyGenotypeCounts(), genotypeSexCounts: emptyGenotypeSexCounts() },
  ]

  cages.forEach((cage) => {
    const bucket = buckets.find((item) => item.id === individualAgeBucketId(cage.dob, todayIso))

    if (!bucket) return
    bucket.total += cage.count
    bucket.sexCounts[cage.sex] += cage.count
    genotypeCountEntries(cage).forEach(([genotype, count]) => {
      bucket.genotypeCounts[genotype] += count
      bucket.genotypeSexCounts[genotype][cage.sex] += count
    })
  })

  return buckets
}

export function individualAgeBucketId(dob: string, todayIso = format(today, 'yyyy-MM-dd')): IndividualAgeBucketId {
  const current = parseISO(todayIso)
  const weeks = Math.max(0, differenceInWeeks(current, parseISO(dob)))
  const months = Math.max(0, differenceInMonths(current, parseISO(dob)))

  if (weeks >= 52) return 'overOneYear'
  if (months >= 6) return 'sixMonthsToOneYear'
  if (weeks > 8) return 'adultToSixMonths'
  if (weeks >= 6) return 'experimentReady'
  return 'underSixWeeks'
}

export function isDueSoon(cage: BreedingCage) {
  const due = weanDate(cage)
  return Boolean(due && !isBefore(due, today) && differenceInCalendarDays(due, today) <= 7)
}

export function fmt(value?: string) {
  return value ? format(parseISO(value), 'MMM d, yyyy') : '—'
}

export interface ReminderEvent {
  date: Date
  title: string
  description: string
}

export function buildReminderEvents(cages: BreedingCage[], litters: LitterRecord[] = [], todayIso = format(today, 'yyyy-MM-dd')): ReminderEvent[] {
  const current = parseISO(todayIso)
  const legacyEvents = cages.flatMap((cage) => {
    const due = weanDate(cage)
    const genotype = genotypeWindow(cage)
    const base: ReminderEvent[] = []
    if (due && (isAfter(due, today) || isEqual(due, today))) {
      base.push({
        date: due,
        title: `Wean ${cage.line} cage ${cage.cage}`,
        description: `P21 wean. Pups DOB ${cage.pupsDob ?? ''}. Count ${cage.pupsCount ?? 'not recorded'}.`,
      })
    }
    if (genotype && (isAfter(genotype[0], today) || isEqual(genotype[0], today))) {
      base.push({
        date: genotype[0],
        title: `Genotype ${cage.line} cage ${cage.cage}`,
        description: `Genotype window ${format(genotype[0], 'MMM d')}–${format(genotype[1], 'MMM d')}.`,
      })
    }
    return base
  })

  const litterEvents = litters.flatMap((litter) => {
    const livingPups = litter.pups.filter((pup) => pup.alive)
    if (livingPups.length && livingPups.every((pup) => pup.transferredAt)) return []
    const dates = litterDates(litter.dob)
    const wean = parseISO(dates.weanDate)
    const genotype = parseISO(dates.genotypeStart)
    const base: ReminderEvent[] = []
    if (isAfter(wean, current) || isEqual(wean, current)) {
      base.push({
        date: wean,
        title: `Wean ${litter.line} litter ${litter.reference}`,
        description: `P21 wean for ${litter.reference}. Source breeding cage ${litter.breedingCageLabel}. Count ${litter.pupCount}.`,
      })
    }
    if (litter.genotypeRequired && (isAfter(genotype, current) || isEqual(genotype, current))) {
      base.push({
        date: genotype,
        title: `Genotype ${litter.line} litter ${litter.reference}`,
        description: `Genotype window ${format(parseISO(dates.genotypeStart), 'MMM d')}-${format(parseISO(dates.genotypeEnd), 'MMM d')}.`,
      })
    }
    return base
  })

  return [...legacyEvents, ...litterEvents]
}

export function downloadIcs(cages: BreedingCage[], litters: LitterRecord[] = []) {
  const events = buildReminderEvents(cages, litters)

  const stamp = format(today, "yyyyMMdd'T'HHmmss")
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Colony Ops//Mouse Colony//EN',
    ...events.flatMap((event, index) => {
      const date = format(event.date, 'yyyyMMdd')
      return [
        'BEGIN:VEVENT',
        `UID:${stamp}-${index}@colony-ops`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${date}`,
        `DTEND;VALUE=DATE:${format(addDays(event.date, 1), 'yyyyMMdd')}`,
        `SUMMARY:${event.title}`,
        `DESCRIPTION:${event.description}`,
        'BEGIN:VALARM',
        'TRIGGER:-PT8H',
        'ACTION:DISPLAY',
        `DESCRIPTION:${event.title}`,
        'END:VALARM',
        'END:VEVENT',
      ]
    }),
    'END:VCALENDAR',
  ].join('\r\n')

  const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `mouse-colony-reminders-${format(today, 'yyyy-MM-dd')}.ics`
  link.click()
  URL.revokeObjectURL(url)
}
