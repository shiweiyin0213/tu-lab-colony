import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureColonyData } from '../test/fixtures'
import {
  loadProductionColonyData,
  saveProductionColonyChanges,
  saveProductionColonyData,
  subscribeToProductionColonyData,
} from './productionColonyRepository'
import { requireSupabase } from '../services/supabaseClient'

vi.mock('../services/supabaseClient', () => ({
  requireSupabase: vi.fn(),
}))

const mockedRequireSupabase = vi.mocked(requireSupabase)

describe('productionColonyRepository', () => {
  beforeEach(() => {
    mockedRequireSupabase.mockReset()
  })

  it('returns null when the lab does not have a cloud snapshot yet', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    mockedRequireSupabase.mockReturnValue({ from } as never)

    await expect(loadProductionColonyData('lab-1')).resolves.toBeNull()
  })

  it('saves the full colony data as a lab snapshot', async () => {
    const select = vi.fn().mockResolvedValue({ data: null, error: null })
    const upsert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ upsert }))
    mockedRequireSupabase.mockReturnValue({ from } as never)

    await saveProductionColonyData('lab-1', fixtureColonyData)

    expect(from).toHaveBeenCalledWith('colony_snapshots')
    expect(upsert).toHaveBeenCalledWith({
      lab_id: 'lab-1',
      data: fixtureColonyData,
      updated_at: expect.any(String),
    }, { onConflict: 'lab_id' })
  })

  it('rejects when Supabase returns a cloud save error', async () => {
    const select = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'JWT expired' },
    })
    const upsert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ upsert }))
    mockedRequireSupabase.mockReturnValue({ from } as never)

    await expect(saveProductionColonyData('lab-1', fixtureColonyData))
      .rejects.toThrow('JWT expired')
  })

  it('merges a local edit with newer cloud records before saving', async () => {
    const remoteCage = { ...fixtureColonyData.individual[0], id: 'remote-cage', cage: 'RGS2-I999' }
    const cloudData = { ...fixtureColonyData, individual: [...fixtureColonyData.individual, remoteCage] }
    const localData = {
      ...fixtureColonyData,
      breeding: fixtureColonyData.breeding.map((cage, index) => index === 0 ? { ...cage, notes: 'Phone edit' } : cage),
    }
    const maybeSingle = vi.fn().mockResolvedValue({ data: { data: cloudData, updated_at: '2026-09-10T20:00:00.000Z' }, error: null })
    const readEq = vi.fn(() => ({ maybeSingle }))
    const readSelect = vi.fn(() => ({ eq: readEq }))
    const writeSelect = vi.fn().mockImplementation(async () => ({
      data: [{ data: { ...cloudData, breeding: localData.breeding }, updated_at: '2026-09-10T20:00:01.000Z' }],
      error: null,
    }))
    const revisionEq = vi.fn(() => ({ select: writeSelect }))
    const labEq = vi.fn(() => ({ eq: revisionEq }))
    const update = vi.fn(() => ({ eq: labEq }))
    const from = vi.fn(() => ({ select: readSelect, update }))
    mockedRequireSupabase.mockReturnValue({ from } as never)

    const saved = await saveProductionColonyChanges('lab-1', fixtureColonyData, localData)

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ individual: expect.arrayContaining([remoteCage]) }),
      updated_at: expect.any(String),
    }))
    expect(revisionEq).toHaveBeenCalledWith('updated_at', '2026-09-10T20:00:00.000Z')
    expect(saved.individual).toContainEqual(remoteCage)
    expect(saved.breeding[0].notes).toBe('Phone edit')
  })

  it('reloads and retries when another device wins the first conditional update', async () => {
    const firstRemote = { ...fixtureColonyData.individual[0], id: 'phone-a-cage', cage: 'RGS2-I998' }
    const secondRemote = { ...fixtureColonyData.individual[0], id: 'phone-c-cage', cage: 'RGS2-I999' }
    const cloudOne = { ...fixtureColonyData, individual: [...fixtureColonyData.individual, firstRemote] }
    const cloudTwo = { ...fixtureColonyData, individual: [...fixtureColonyData.individual, firstRemote, secondRemote] }
    const local = { ...fixtureColonyData, breeding: [] }
    const maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: { data: cloudOne, updated_at: '2026-09-10T20:00:00.000Z' }, error: null })
      .mockResolvedValueOnce({ data: { data: cloudTwo, updated_at: '2026-09-10T20:00:01.000Z' }, error: null })
    const readEq = vi.fn(() => ({ maybeSingle }))
    const readSelect = vi.fn(() => ({ eq: readEq }))
    const writeSelect = vi.fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ data: { ...cloudTwo, breeding: [] }, updated_at: '2026-09-10T20:00:02.000Z' }], error: null })
    const revisionEq = vi.fn(() => ({ select: writeSelect }))
    const labEq = vi.fn(() => ({ eq: revisionEq }))
    const update = vi.fn(() => ({ eq: labEq }))
    mockedRequireSupabase.mockReturnValue({ from: vi.fn(() => ({ select: readSelect, update })) } as never)

    const saved = await saveProductionColonyChanges('lab-1', fixtureColonyData, local)

    expect(update).toHaveBeenCalledTimes(2)
    expect(saved.individual).toEqual(expect.arrayContaining([firstRemote, secondRemote]))
    expect(saved.breeding).toEqual([])
  })

  it('publishes normalized snapshot updates and removes the live channel on cleanup', () => {
    let receiveUpdate: ((payload: { new: { data: typeof fixtureColonyData } }) => void) | undefined
    const channel = {} as { on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> }
    const subscribe = vi.fn().mockReturnValue(channel)
    const on = vi.fn((_event, _filter, callback) => {
      receiveUpdate = callback
      return channel
    })
    channel.on = on
    channel.subscribe = subscribe
    const removeChannel = vi.fn()
    mockedRequireSupabase.mockReturnValue({
      channel: vi.fn().mockReturnValue(channel),
      removeChannel,
    } as never)
    const onData = vi.fn()

    const cleanup = subscribeToProductionColonyData('lab-1', onData)
    receiveUpdate?.({ new: { data: { ...fixtureColonyData, protocols: undefined } as never } })

    expect(onData).toHaveBeenCalledWith({ ...fixtureColonyData, protocols: [] })
    cleanup()
    expect(removeChannel).toHaveBeenCalledWith(channel)
  })
})
