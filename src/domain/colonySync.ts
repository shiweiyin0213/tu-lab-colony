import type { ColonyData } from '../types'

type IdentifiedRecord = { id: string } & Record<string, unknown>

const sameValue = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

function mergeRecords<T extends { id: string }>(base: T[], next: T[], cloud: T[]): T[] {
  const baseById = new Map(base.map(record => [record.id, record]))
  const nextById = new Map(next.map(record => [record.id, record]))
  const cloudIds = new Set(cloud.map(record => record.id))

  const merged = cloud.flatMap((cloudRecord) => {
    const baseRecord = baseById.get(cloudRecord.id)
    const nextRecord = nextById.get(cloudRecord.id)

    if (baseRecord && !nextRecord) return []
    if (!nextRecord || sameValue(baseRecord, nextRecord)) return [cloudRecord]

    const result: IdentifiedRecord = { ...(cloudRecord as T & Record<string, unknown>) }
    const baseline = (baseRecord ?? {}) as Record<string, unknown>
    const local = nextRecord as T & Record<string, unknown>
    const keys = new Set([...Object.keys(baseline), ...Object.keys(local)])

    keys.forEach((key) => {
      if (sameValue(baseline[key], local[key])) return
      if (Object.prototype.hasOwnProperty.call(local, key)) result[key] = local[key]
      else delete result[key]
    })

    return [result as T]
  })

  next.forEach((nextRecord) => {
    if (cloudIds.has(nextRecord.id)) return
    const baseRecord = baseById.get(nextRecord.id)
    if (!baseRecord || !sameValue(baseRecord, nextRecord)) merged.push(nextRecord)
  })

  return merged
}

function mergeArchivedLines(base: string[] = [], next: string[] = [], cloud: string[] = []) {
  const baseSet = new Set(base)
  const nextSet = new Set(next)
  const merged = new Set(cloud)

  base.forEach((line) => {
    if (!nextSet.has(line)) merged.delete(line)
  })
  next.forEach((line) => {
    if (!baseSet.has(line)) merged.add(line)
  })

  return [...merged]
}

export function mergeColonyDataChanges(base: ColonyData, next: ColonyData, cloud: ColonyData): ColonyData {
  const archivedLines = mergeArchivedLines(base.archivedLines, next.archivedLines, cloud.archivedLines)
  const merged: ColonyData = {
    breeding: mergeRecords(base.breeding, next.breeding, cloud.breeding),
    individual: mergeRecords(base.individual, next.individual, cloud.individual),
    work: mergeRecords(base.work, next.work, cloud.work),
    litters: mergeRecords(base.litters, next.litters, cloud.litters),
    protocols: mergeRecords(base.protocols, next.protocols, cloud.protocols),
  }

  return archivedLines.length || base.archivedLines || next.archivedLines || cloud.archivedLines
    ? { ...merged, archivedLines }
    : merged
}
