import { seedData } from '../seed'
import type { ColonyData } from '../types'

export const storageKey = 'colony-ops-data-v3'
const legacyStorageKey = 'colony-ops-data-v2'

interface StoredColonyData {
  version: 3
  data: ColonyData
}

export function loadColonyData(storage: Storage = localStorage): ColonyData {
  const saved = storage.getItem(storageKey)
  if (saved) {
    return normalizeColonyData(JSON.parse(saved).data)
  }

  const legacy = storage.getItem(legacyStorageKey)
  if (legacy) {
    return normalizeColonyData(JSON.parse(legacy))
  }

  return cloneData(seedData)
}

export function saveColonyData(data: ColonyData, storage: Storage = localStorage) {
  const stored: StoredColonyData = {
    version: 3,
    data: normalizeColonyData(data),
  }
  storage.setItem(storageKey, JSON.stringify(stored))
}

function normalizeColonyData(value: Partial<ColonyData>): ColonyData {
  const normalized: ColonyData = {
    breeding: value.breeding ?? [],
    individual: value.individual ?? [],
    work: value.work ?? [],
    litters: value.litters ?? [],
    protocols: value.protocols ?? [],
  }
  return value.archivedLines?.length
    ? { ...normalized, archivedLines: [...value.archivedLines] }
    : normalized
}

function cloneData(data: ColonyData): ColonyData {
  return JSON.parse(JSON.stringify(data))
}
