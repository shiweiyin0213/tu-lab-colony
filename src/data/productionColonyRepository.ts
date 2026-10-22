import type { ColonyData } from '../types'
import { mergeColonyDataChanges } from '../domain/colonySync'
import { requireSupabase } from '../services/supabaseClient'

interface ColonySnapshotRow {
  data: ColonyData
  updated_at?: string
}

export async function loadProductionColonyData(labId: string): Promise<ColonyData | null> {
  const snapshot = await loadProductionColonySnapshot(labId)
  return snapshot?.data ?? null
}

async function loadProductionColonySnapshot(labId: string): Promise<{ data: ColonyData; updatedAt: string } | null> {
  const { data, error } = await requireSupabase()
    .from('colony_snapshots')
    .select('data,updated_at')
    .eq('lab_id', labId)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  if (!data) return null
  const row = data as ColonySnapshotRow
  return {
    data: normalizeSnapshot(row),
    updatedAt: row.updated_at ?? '',
  }
}

export async function saveProductionColonyData(labId: string, data: ColonyData) {
  const result = await requireSupabase()
    .from('colony_snapshots')
    .upsert({
      lab_id: labId,
      data,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'lab_id' })
    .select()

  if (result.error) throw new Error(result.error.message)
  return result
}

export async function saveProductionColonyChanges(labId: string, base: ColonyData, next: ColonyData): Promise<ColonyData> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const snapshot = await loadProductionColonySnapshot(labId)
    if (!snapshot) throw new Error('Cloud colony snapshot was not found.')

    const merged = mergeColonyDataChanges(base, next, snapshot.data)
    const previousTime = Date.parse(snapshot.updatedAt)
    const updatedAt = new Date(Math.max(Date.now(), Number.isNaN(previousTime) ? 0 : previousTime + 1)).toISOString()
    const result = await requireSupabase()
      .from('colony_snapshots')
      .update({ data: merged, updated_at: updatedAt })
      .eq('lab_id', labId)
      .eq('updated_at', snapshot.updatedAt)
      .select('data,updated_at')

    if (result.error) throw new Error(result.error.message)
    const savedRow = result.data?.[0] as ColonySnapshotRow | undefined
    if (savedRow) return normalizeSnapshot(savedRow)
  }

  throw new Error('Another device is updating the colony. Please try this edit again.')
}

export function subscribeToProductionColonyData(
  labId: string,
  onData: (data: ColonyData) => void,
) {
  const client = requireSupabase()
  const channel = client
    .channel(`colony-snapshot-${labId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'colony_snapshots', filter: `lab_id=eq.${labId}` },
      (payload) => onData(normalizeSnapshot(payload.new as unknown as ColonySnapshotRow)),
    )
    .subscribe()

  return () => {
    void client.removeChannel(channel)
  }
}

function normalizeSnapshot(row: ColonySnapshotRow): ColonyData {
  const normalized: ColonyData = {
    breeding: row.data.breeding ?? [],
    individual: row.data.individual ?? [],
    work: row.data.work ?? [],
    litters: row.data.litters ?? [],
    protocols: row.data.protocols ?? [],
  }
  return row.data.archivedLines?.length
    ? { ...normalized, archivedLines: [...row.data.archivedLines] }
    : normalized
}
