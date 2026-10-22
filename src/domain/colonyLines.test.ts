import { describe, expect, it } from 'vitest'
import { fixtureColonyData } from '../test/fixtures'
import {
  archiveColonyLine,
  deleteColonyLine,
  getActiveColonyLines,
  getArchivedColonyLines,
  restoreColonyLine,
} from './colonyLines'

describe('colony line lifecycle', () => {
  it('archives and restores a line without deleting its records', () => {
    const archived = archiveColonyLine(fixtureColonyData, 'RGS2')

    expect(getActiveColonyLines(archived)).not.toContain('RGS2')
    expect(getArchivedColonyLines(archived)).toContain('RGS2')
    expect(archived.breeding.some((cage) => cage.line === 'RGS2')).toBe(true)

    const restored = restoreColonyLine(archived, 'RGS2')
    expect(getActiveColonyLines(restored)).toContain('RGS2')
    expect(getArchivedColonyLines(restored)).not.toContain('RGS2')
  })

  it('permanently deletes every record linked to a line', () => {
    const deleted = deleteColonyLine(fixtureColonyData, 'RGS2')

    expect(deleted.breeding.some((record) => record.line === 'RGS2')).toBe(false)
    expect(deleted.individual.some((record) => record.line === 'RGS2')).toBe(false)
    expect(deleted.work.some((record) => record.line === 'RGS2')).toBe(false)
    expect(deleted.litters.some((record) => record.line === 'RGS2')).toBe(false)
    expect(deleted.protocols.some((record) => record.line === 'RGS2')).toBe(false)
    expect(getActiveColonyLines(deleted)).not.toContain('RGS2')
    expect(getArchivedColonyLines(deleted)).not.toContain('RGS2')
  })
})
