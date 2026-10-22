import { describe, expect, it } from 'vitest'
import type { ColonyData } from '../types'
import { seedData } from '../seed'
import { loadColonyData, saveColonyData, storageKey } from './colonyRepository'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

function countMice(data: ColonyData) {
  return data.individual.reduce((sum, cage) => sum + cage.count, 0)
}

describe('colonyRepository', () => {
  it('migrates existing v2 browser data and preserves confirmed inventory counts', () => {
    const storage = new MemoryStorage()
    storage.setItem('colony-ops-data-v2', JSON.stringify({
      breeding: seedData.breeding,
      individual: seedData.individual,
      work: seedData.work,
    }))

    const loaded = loadColonyData(storage)

    expect(loaded.breeding).toHaveLength(49)
    expect(loaded.individual).toHaveLength(62)
    expect(countMice(loaded)).toBe(153)
    expect(loaded.litters).toEqual([])
  })

  it('saves and loads version 3 data with litters intact', () => {
    const storage = new MemoryStorage()
    const next: ColonyData = { ...seedData, litters: [] }

    saveColonyData(next, storage)

    expect(JSON.parse(storage.getItem(storageKey) ?? '{}')).toMatchObject({ version: 3 })
    expect(loadColonyData(storage)).toEqual(next)
  })
})
