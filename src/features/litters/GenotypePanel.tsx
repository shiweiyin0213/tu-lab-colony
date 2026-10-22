import { useState } from 'react'
import { Upload } from 'lucide-react'
import type { LitterRecord, PupGenotype, PupSex } from '../../domain/colony'
import { saveAttachment, validateAttachment } from '../../data/attachmentRepository'

interface GenotypePanelProps {
  litter: LitterRecord
  onSave: (litter: LitterRecord) => void
}

const genotypeOptions: PupGenotype[] = ['Unknown', 'WT', 'HET', 'KO', 'Inconclusive', 'Rerun required', 'Custom']
const sexOptions: PupSex[] = ['Unknown', 'Male', 'Female']

export function GenotypePanel({ litter, onSave }: GenotypePanelProps) {
  const [draft, setDraft] = useState(litter.pups)
  const [correctedCount, setCorrectedCount] = useState(String(litter.pupCount))
  const [gelFile, setGelFile] = useState<File | null>(null)
  const [gelRunDate, setGelRunDate] = useState(litter.gelRunDate || '')
  const [assayNotes, setAssayNotes] = useState(litter.assayNotes || '')
  const [error, setError] = useState('')

  const updatePup = (pupId: string, patch: Partial<(typeof draft)[number]>) => {
    setDraft((current) => current.map((pup) => pup.id === pupId ? { ...pup, ...patch } : pup))
  }

  const makeBlankPup = (tattooNumber: number) => ({
    id: `${litter.id}-pup-${tattooNumber}-${crypto.randomUUID()}`,
    tattooNumber,
    genotype: 'Unknown' as PupGenotype,
    sex: 'Unknown' as PupSex,
    alive: true,
  })

  const syncCount = (nextLength: number) => {
    setCorrectedCount(String(nextLength))
  }

  const isBlankPup = (pup: (typeof draft)[number]) => (
    pup.genotype === 'Unknown'
    && pup.sex === 'Unknown'
    && !pup.notes
    && pup.alive
    && !pup.transferredAt
    && !pup.individualCageId
  )

  const applyPupCount = () => {
    const nextCount = Number(correctedCount)
    if (!Number.isInteger(nextCount) || nextCount < 0) {
      setError('Pup count must be a whole number.')
      return
    }
    if (nextCount === draft.length) {
      setError('')
      return
    }
    if (nextCount > draft.length) {
      setDraft((current) => {
        const next = [...current]
        for (let tattooNumber = current.length + 1; tattooNumber <= nextCount; tattooNumber += 1) {
          next.push(makeBlankPup(tattooNumber))
        }
        syncCount(next.length)
        return next
      })
      setError('')
      return
    }

    const pupsToRemove = draft.slice(nextCount)
    if (pupsToRemove.some((pup) => !isBlankPup(pup))) {
      setError('Only blank trailing pups can be removed. Clear genotype, sex, notes, and transfer data first.')
      return
    }
    setDraft((current) => {
      const next = current.slice(0, nextCount)
      syncCount(next.length)
      return next
    })
    setError('')
  }

  const addPupRow = () => {
    setDraft((current) => {
      const next = [...current, makeBlankPup(current.length + 1)]
      syncCount(next.length)
      return next
    })
    setError('')
  }

  const removePupRow = (pupId: string) => {
    const targetIndex = draft.findIndex((pup) => pup.id === pupId)
    if (targetIndex === -1) return
    const target = draft[targetIndex]
    const laterRowsHaveData = draft.slice(targetIndex + 1).some((pup) => !isBlankPup(pup))
    if (!isBlankPup(target) || laterRowsHaveData) {
      setError('Only blank tattoo rows can be removed. If later rows already have data, remove blank rows from the bottom first.')
      return
    }

    setDraft((current) => {
      const next = current
        .filter((pup) => pup.id !== pupId)
        .map((pup, index) => ({ ...pup, tattooNumber: index + 1 }))
      syncCount(next.length)
      return next
    })
    setError('')
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    const metadata = gelFile ? await saveAttachment(gelFile) : undefined
    onSave({
      ...litter,
      pupCount: draft.length,
      pups: draft,
      gelRunDate: gelRunDate || undefined,
      assayNotes: assayNotes || undefined,
      attachmentIds: metadata ? [...litter.attachmentIds, metadata.id] : litter.attachmentIds,
      attachments: metadata ? [...(litter.attachments ?? []), metadata] : litter.attachments,
      updatedAt: new Date().toISOString(),
    })
  }

  const chooseFile = (file?: File) => {
    if (!file) return
    const errors = validateAttachment(file)
    if (errors.length) {
      setError(errors.join(' '))
      return
    }
    setError('')
    setGelFile(file)
  }

  return (
    <form className="genotype-panel" onSubmit={submit}>
      <div className="litter-section-header">
        <div>
          <h3>Gel evidence and genotype results</h3>
          <span>Upload the gel and map tattoo number to genotype now. Sex is optional and can stay Unknown until wean day.</span>
        </div>
        <button className="button primary">Save genotype</button>
      </div>

      <div className="gel-grid">
        <label>Gel run date<input type="date" value={gelRunDate} onChange={(event) => setGelRunDate(event.target.value)} /></label>
        <label className="gel-upload"><Upload size={16} />Gel image / raw result upload<input aria-label="Gel image" type="file" accept="image/jpeg,image/png,image/heic,image/heif,application/pdf" onChange={(event) => chooseFile(event.target.files?.[0])} /></label>
      </div>
      <div className="pup-count-editor">
        <label>Correct pup count
          <input aria-label="Correct pup count" type="number" min={0} value={correctedCount} onChange={(event) => setCorrectedCount(event.target.value)} />
        </label>
        <button className="button secondary" type="button" onClick={applyPupCount}>Apply count</button>
        <span>{draft.length} tattoo rows now</span>
      </div>
      <label>Assay notes<textarea value={assayNotes} onChange={(event) => setAssayNotes(event.target.value)} /></label>
      {error && <div className="form-error">{error}</div>}
      <div className="attachment-list">
        {(litter.attachments ?? []).map((attachment) => <span key={attachment.id}>{attachment.originalName}</span>)}
        {gelFile && <span>{gelFile.name}</span>}
      </div>

      <div className="pup-table">
        <div className="pup-table-note">
          <div>
            <strong>Tattoo map</strong>
            <span>Genotype is the main PCR result. Sex is optional here; fill it later during wean if pups are too young today.</span>
          </div>
          <button className="button secondary" type="button" onClick={addPupRow}>Add tattoo row</button>
        </div>
        {draft.map((pup) => (
          <div className="pup-row" key={pup.id}>
            <strong>Tattoo #{pup.tattooNumber}</strong>
            <label>Genotype #{pup.tattooNumber}
              <select value={pup.genotype} onChange={(event) => updatePup(pup.id, { genotype: event.target.value as PupGenotype })}>
                {genotypeOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label>Sex #{pup.tattooNumber} <span className="optional-label">optional at wean</span>
              <select aria-label={`Sex #${pup.tattooNumber}`} value={pup.sex} onChange={(event) => updatePup(pup.id, { sex: event.target.value as PupSex })}>
                {sexOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label>Notes #{pup.tattooNumber}
              <input value={pup.notes || ''} onChange={(event) => updatePup(pup.id, { notes: event.target.value })} />
            </label>
            <button className="button danger" type="button" onClick={() => removePupRow(pup.id)}>Remove</button>
          </div>
        ))}
      </div>
    </form>
  )
}
