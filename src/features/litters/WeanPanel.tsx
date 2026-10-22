import { format } from 'date-fns'
import { useEffect, useState } from 'react'
import type { CageSize, LitterRecord, PupSex, WeanGroupDraft } from '../../domain/colony'
import { suggestWeanGroups, validateWeanTransfer } from '../../domain/litterRules'

interface WeanPanelProps {
  litter: LitterRecord
  onTransfer: (groups: WeanGroupDraft[]) => void
}

export function WeanPanel({ litter, onTransfer }: WeanPanelProps) {
  const [groups, setGroups] = useState<WeanGroupDraft[]>(() => suggestWeanGroups(litter))
  const errors = validateWeanTransfer(litter, groups, format(new Date(), 'yyyy-MM-dd'))
  const livingPups = litter.pups.filter((pup) => pup.alive)

  useEffect(() => {
    setGroups(suggestWeanGroups(litter))
  }, [litter.id, litter.updatedAt])

  const confirm = () => {
    if (errors.length) return
    onTransfer(groups)
  }

  const updateGroup = (groupId: string, patch: Partial<WeanGroupDraft>) => {
    setGroups((current) => current.map((group) => {
      if (group.id !== groupId) return group
      const nextSex = patch.sex ?? group.sex
      const nextPupIds = patch.sex && patch.sex !== group.sex
        ? group.pupIds.filter((pupId) => livingPups.find((pup) => pup.id === pupId)?.sex === nextSex)
        : patch.pupIds ?? group.pupIds
      return { ...group, ...patch, pupIds: nextPupIds }
    }))
  }

  const togglePup = (group: WeanGroupDraft, pupId: string) => {
    const pupIds = group.pupIds.includes(pupId)
      ? group.pupIds.filter((id) => id !== pupId)
      : [...group.pupIds, pupId]
    updateGroup(group.id, { pupIds })
  }

  const addGroup = () => {
    const sex = (livingPups.find((pup) => pup.sex !== 'Unknown')?.sex ?? 'Male') as Exclude<PupSex, 'Unknown'>
    setGroups((current) => [...current, {
      id: `manual-group-${Date.now()}`,
      sex,
      cageSize: 'small',
      pupIds: [],
    }])
  }

  return (
    <section className="wean-panel">
      <div className="litter-section-header">
        <div>
          <h3>Wean transfer</h3>
          <span>Individual cages are created only after P21, sex confirmation, and one-time placement.</span>
        </div>
        <div className="wean-header-actions">
          <button className="button secondary" onClick={addGroup}>Add cage group</button>
          <button className="button primary" onClick={confirm}>Confirm wean transfer</button>
        </div>
      </div>

      <div className="wean-errors">
        {errors.map((error) => <span key={error}>{error}</span>)}
      </div>

      {groups.length > 0 ? (
        <div className="wean-groups">
          {groups.map((group) => {
            const pups = group.pupIds
              .map((pupId) => litter.pups.find((pup) => pup.id === pupId))
              .filter(Boolean)
            const capacity = group.cageSize === 'small' ? 3 : 6
            const eligiblePups = livingPups.filter((pup) => pup.sex === group.sex)
            return (
              <article className="wean-group" key={group.id}>
                <div className="wean-group-top">
                  <strong>{group.sex} · {group.cageSize} cage</strong>
                  <button className="button danger" onClick={() => setGroups((current) => current.filter((item) => item.id !== group.id))}>Remove</button>
                </div>
                <div className="wean-group-controls">
                  <label>Sex
                    <select value={group.sex} onChange={(event) => updateGroup(group.id, { sex: event.target.value as Exclude<PupSex, 'Unknown'> })}>
                      <option>Male</option>
                      <option>Female</option>
                    </select>
                  </label>
                  <label>Cage size
                    <select value={group.cageSize} onChange={(event) => updateGroup(group.id, { cageSize: event.target.value as CageSize })}>
                      <option value="small">Small cage · max 3</option>
                      <option value="large">Large cage · max 6</option>
                    </select>
                  </label>
                </div>
                <div className="wean-pup-picker">
                  {eligiblePups.map((pup) => (
                    <label key={pup.id}>
                      <input type="checkbox" checked={group.pupIds.includes(pup.id)} onChange={() => togglePup(group, pup.id)} />
                      #{pup.tattooNumber} {pup.genotype}
                    </label>
                  ))}
                </div>
                <span>{pups.length}/{capacity} mice · {pups.map((pup) => `#${pup!.tattooNumber} ${pup!.genotype}`).join('; ') || 'No pups assigned'}</span>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="manual-note">Complete sex fields to generate wean groups, then adjust cage groups by tattoo number before transfer.</div>
      )}
    </section>
  )
}
