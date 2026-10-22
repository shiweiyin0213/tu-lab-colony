import { describe, expect, it } from 'vitest'
import { fixtureColonyData } from '../test/fixtures'
import { mergeColonyDataChanges } from './colonySync'

describe('mergeColonyDataChanges', () => {
  it('preserves a cage added on another device while applying a local cage edit', () => {
    const base = fixtureColonyData
    const remoteCage = {
      ...fixtureColonyData.individual[0],
      id: 'remote-cage',
      cage: 'RGS2-I999',
      count: 4,
    }
    const cloud = {
      ...base,
      individual: [...base.individual, remoteCage],
    }
    const local = {
      ...base,
      breeding: base.breeding.map((cage, index) => index === 0 ? { ...cage, notes: 'Changed on phone B' } : cage),
    }

    const merged = mergeColonyDataChanges(base, local, cloud)

    expect(merged.individual).toContainEqual(remoteCage)
    expect(merged.breeding[0].notes).toBe('Changed on phone B')
  })

  it('merges edits to different fields of the same cage', () => {
    const base = fixtureColonyData
    const cloud = {
      ...base,
      breeding: base.breeding.map((cage, index) => index === 0 ? { ...cage, pupsCount: 8 } : cage),
    }
    const local = {
      ...base,
      breeding: base.breeding.map((cage, index) => index === 0 ? { ...cage, notes: 'Checked today' } : cage),
    }

    const merged = mergeColonyDataChanges(base, local, cloud)

    expect(merged.breeding[0]).toMatchObject({ pupsCount: 8, notes: 'Checked today' })
  })

  it('keeps remote additions while applying an explicit local deletion', () => {
    const base = fixtureColonyData
    const remoteCage = { ...base.individual[0], id: 'remote-cage', cage: 'RGS2-I999' }
    const cloud = { ...base, individual: [...base.individual, remoteCage] }
    const local = { ...base, individual: [] }

    const merged = mergeColonyDataChanges(base, local, cloud)

    expect(merged.individual).toEqual([remoteCage])
  })
})
