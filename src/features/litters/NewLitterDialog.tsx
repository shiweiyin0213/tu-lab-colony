import { useMemo, useState } from 'react'
import { CalendarDays, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { BreedingCage } from '../../types'
import type { LitterRecord } from '../../domain/colony'
import { litterDates, pairingRequiresGenotype } from '../../domain/litterRules'
import { fmt } from '../../utils'

interface NewLitterDialogProps {
  lines: string[]
  cages: BreedingCage[]
  onClose: () => void
  onSave: (litter: LitterRecord) => void
}

export function NewLitterDialog({ lines, cages, onClose, onSave }: NewLitterDialogProps) {
  const [line, setLine] = useState(lines[0] || '')
  const lineCages = useMemo(() => cages.filter((cage) => cage.line === line), [cages, line])
  const [cageId, setCageId] = useState(lineCages[0]?.id || '')
  const [dob, setDob] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [count, setCount] = useState(1)
  const [maleCount, setMaleCount] = useState(0)
  const [femaleCount, setFemaleCount] = useState(0)
  const [unknownSexCount, setUnknownSexCount] = useState(1)
  const [wtCount, setWtCount] = useState(0)
  const [hetCount, setHetCount] = useState(0)
  const [koCount, setKoCount] = useState(0)
  const [unknownGenotypeCount, setUnknownGenotypeCount] = useState(1)
  const selectedCage = cages.find((cage) => cage.id === cageId) ?? lineCages[0]
  const dates = litterDates(dob)
  const genotypeRequired = selectedCage
    ? pairingRequiresGenotype(selectedCage.maleGenotype, selectedCage.femaleGenotype)
    : false

  const changeLine = (next: string) => {
    setLine(next)
    setCageId(cages.find((cage) => cage.line === next)?.id || '')
  }

  const setPupCount = (next: number) => {
    const safeCount = clampPupCount(next)
    setCount(safeCount)
    setUnknownSexCount(Math.max(safeCount - maleCount - femaleCount, 0))
    setUnknownGenotypeCount(Math.max(safeCount - wtCount - hetCount - koCount, 0))
  }

  const updateSexCounts = (kind: 'male' | 'female' | 'unknown', next: number) => {
    const safeValue = clampPupCount(next)
    const nextMale = kind === 'male' ? safeValue : maleCount
    const nextFemale = kind === 'female' ? safeValue : femaleCount
    const nextUnknown = kind === 'unknown' ? safeValue : Math.max(count - nextMale - nextFemale, 0)

    setMaleCount(nextMale)
    setFemaleCount(nextFemale)
    setUnknownSexCount(nextUnknown)
    setCount(clampPupCount(nextMale + nextFemale + nextUnknown))
  }

  const updateGenotypeCounts = (kind: 'wt' | 'het' | 'ko' | 'unknown', next: number) => {
    const safeValue = clampPupCount(next)
    const nextWt = kind === 'wt' ? safeValue : wtCount
    const nextHet = kind === 'het' ? safeValue : hetCount
    const nextKo = kind === 'ko' ? safeValue : koCount
    const nextUnknown = kind === 'unknown' ? safeValue : Math.max(count - nextWt - nextHet - nextKo, 0)

    setWtCount(nextWt)
    setHetCount(nextHet)
    setKoCount(nextKo)
    setUnknownGenotypeCount(nextUnknown)
    setCount(clampPupCount(nextWt + nextHet + nextKo + nextUnknown))
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedCage) return

    const id = `litter-${selectedCage.id}-${dob}-${Date.now()}`
    const reference = `${selectedCage.line}-B${formatCageNumber(selectedCage.cage)}-${dob.replaceAll('-', '')}`
    const now = new Date().toISOString()
    onSave({
      id,
      reference,
      line: selectedCage.line,
      breedingCageId: selectedCage.id,
      breedingCageLabel: selectedCage.cage,
      dob,
      pupCount: count,
      genotypeRequired,
      parents: [
        { sex: 'Male', genotype: selectedCage.maleGenotype, dob: selectedCage.maleDob },
        { sex: 'Female', genotype: selectedCage.femaleGenotype, dob: selectedCage.femaleDob },
      ],
      pups: Array.from({ length: count }, (_, index) => ({
        id: `${id}-pup-${index + 1}`,
        tattooNumber: index + 1,
        genotype: index < wtCount ? 'WT' : index < wtCount + hetCount ? 'HET' : index < wtCount + hetCount + koCount ? 'KO' : 'Unknown',
        sex: index < maleCount ? 'Male' : index < maleCount + femaleCount ? 'Female' : 'Unknown',
        alive: true,
      })),
      attachmentIds: [],
      createdAt: now,
      updatedAt: now,
    })
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal litter-modal" role="dialog" aria-modal="true" aria-label="Record new litter" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <div>
            <h2>Record new litter</h2>
            <span>Tattoo numbers, genotype window, and P21 calculate automatically.</span>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close new litter"><X /></button>
        </div>
        <label>Colony line
          <select value={line} onChange={(event) => changeLine(event.target.value)}>
            {lines.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>Breeding cage
          <select value={cageId} onChange={(event) => setCageId(event.target.value)}>
            {lineCages.map((cage) => (
              <option value={cage.id} key={cage.id}>Cage {cage.cage} · {cage.pairing} · parents {cage.maleDob} / {cage.femaleDob}</option>
            ))}
          </select>
        </label>
        {selectedCage && (
          <section className="snapshot-box">
            <h3>Parent snapshots</h3>
            <div>
              <span>Male {selectedCage.maleGenotype} · {fmt(selectedCage.maleDob)}</span>
              <span>Female {selectedCage.femaleGenotype} · {fmt(selectedCage.femaleDob)}</span>
            </div>
          </section>
        )}
        <div className="form-grid">
          <label>Pups DOB<input type="date" value={dob} onChange={(event) => setDob(event.target.value)} required /></label>
          <label>Pups count<input type="number" min="1" max="20" value={count} onChange={(event) => setPupCount(Number(event.target.value))} required /></label>
        </div>
        <section className="sex-count-box">
          <div>
            <h3>Pup sex</h3>
            <span>Leave unknown when pups are too young to sex.</span>
          </div>
          <div className="sex-count-grid">
            <label>Male pups<input type="number" min="0" max="20" value={maleCount} onChange={(event) => updateSexCounts('male', Number(event.target.value))} /></label>
            <label>Female pups<input type="number" min="0" max="20" value={femaleCount} onChange={(event) => updateSexCounts('female', Number(event.target.value))} /></label>
            <label>Unknown sex pups<input type="number" min="0" max="20" value={unknownSexCount} onChange={(event) => updateSexCounts('unknown', Number(event.target.value))} /></label>
          </div>
          <p>{maleCount} male · {femaleCount} female · {unknownSexCount} unknown</p>
        </section>
        <section className="sex-count-box">
          <div>
            <h3>Pup genotype</h3>
            <span>Use unknown when genotype has not been run yet.</span>
          </div>
          <div className="genotype-count-grid">
            <label>WT pups<input type="number" min="0" max="20" value={wtCount} onChange={(event) => updateGenotypeCounts('wt', Number(event.target.value))} /></label>
            <label>HET pups<input type="number" min="0" max="20" value={hetCount} onChange={(event) => updateGenotypeCounts('het', Number(event.target.value))} /></label>
            <label>KO pups<input type="number" min="0" max="20" value={koCount} onChange={(event) => updateGenotypeCounts('ko', Number(event.target.value))} /></label>
            <label>Unknown genotype pups<input type="number" min="0" max="20" value={unknownGenotypeCount} onChange={(event) => updateGenotypeCounts('unknown', Number(event.target.value))} /></label>
          </div>
          <p>{wtCount} WT · {hetCount} HET · {koCount} KO · {unknownGenotypeCount} unknown</p>
        </section>
        <div className="date-preview">
          <CalendarDays size={18} />
          <div>
            <strong>Wean due {format(parseISO(dates.weanDate), 'MMM d, yyyy')}</strong>
            <span>{genotypeRequired ? `Genotype window P4-P11: ${format(parseISO(dates.genotypeStart), 'MMM d')}-${format(parseISO(dates.genotypeEnd), 'MMM d')}` : 'Genotype not required unless manually overridden.'}</span>
          </div>
        </div>
        <div className="tattoo-preview">Tattoo numbers: #1-#{count}</div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={!selectedCage}>Save litter</button>
        </div>
      </form>
    </div>
  )
}

function formatCageNumber(cage: string) {
  const numeric = Number(cage)
  return Number.isFinite(numeric) ? String(numeric).padStart(2, '0') : cage.replace(/\W/g, '').slice(0, 6)
}

function clampPupCount(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(20, Math.trunc(value)))
}
