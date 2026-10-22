import type { ColonyData } from '../types'

export interface ColonyLineSummary {
  breeding: number
  individual: number
  work: number
  litters: number
  protocols: number
}

function recordedColonyLines(data: ColonyData) {
  return Array.from(new Set([
    ...data.breeding.map((record) => record.line),
    ...data.individual.map((record) => record.line),
    ...data.protocols.map((record) => record.line),
  ].filter(Boolean)))
}

export function getActiveColonyLines(data: ColonyData) {
  const archived = new Set(data.archivedLines ?? [])
  return recordedColonyLines(data).filter((line) => !archived.has(line))
}

export function getArchivedColonyLines(data: ColonyData) {
  const recorded = new Set(recordedColonyLines(data))
  return (data.archivedLines ?? []).filter((line) => recorded.has(line))
}

export function getColonyLineSummary(data: ColonyData, line: string): ColonyLineSummary {
  return {
    breeding: data.breeding.filter((record) => record.line === line).length,
    individual: data.individual.filter((record) => record.line === line).length,
    work: data.work.filter((record) => record.line === line).length,
    litters: data.litters.filter((record) => record.line === line).length,
    protocols: data.protocols.filter((record) => record.line === line).length,
  }
}

export function archiveColonyLine(data: ColonyData, line: string): ColonyData {
  return {
    ...data,
    archivedLines: Array.from(new Set([...(data.archivedLines ?? []), line])),
  }
}

export function restoreColonyLine(data: ColonyData, line: string): ColonyData {
  return {
    ...data,
    archivedLines: (data.archivedLines ?? []).filter((item) => item !== line),
  }
}

export function deleteColonyLine(data: ColonyData, line: string): ColonyData {
  return {
    ...data,
    breeding: data.breeding.filter((record) => record.line !== line),
    individual: data.individual.filter((record) => record.line !== line),
    work: data.work.filter((record) => record.line !== line),
    litters: data.litters.filter((record) => record.line !== line),
    protocols: data.protocols.filter((record) => record.line !== line),
    archivedLines: (data.archivedLines ?? []).filter((item) => item !== line),
  }
}
