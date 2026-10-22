import { format, parseISO } from 'date-fns'
import { ArrowLeft } from 'lucide-react'
import type { LitterRecord } from '../../domain/colony'
import { getLitterStatus, litterDates } from '../../domain/litterRules'
import { fmt } from '../../utils'
import { GenotypePanel } from './GenotypePanel'
import { WeanPanel } from './WeanPanel'
import type { WeanGroupDraft } from '../../domain/colony'

interface LitterWorkspaceProps {
  litter: LitterRecord
  onBack: () => void
  onSave: (litter: LitterRecord) => void
  onTransfer: (groups: WeanGroupDraft[]) => void
}

export function LitterWorkspace({ litter, onBack, onSave, onTransfer }: LitterWorkspaceProps) {
  const dates = litterDates(litter.dob)
  const status = getLitterStatus(litter, format(new Date(), 'yyyy-MM-dd'))

  return (
    <div className="litter-workspace">
      <button className="back-button" onClick={onBack}><ArrowLeft size={16} />Back to litters</button>
      <header className="workspace-hero">
        <div>
          <span className="eyebrow">{litter.line} · breeding cage {litter.breedingCageLabel}</span>
          <h2>{litter.reference}</h2>
          <p>DOB {fmt(litter.dob)} · {litter.pupCount} pups · P21 {format(parseISO(dates.weanDate), 'MMM d, yyyy')}</p>
        </div>
        <span className={`badge ${status === 'wean_attention' ? 'urgent' : status === 'genotype_due' || status === 'genotype_in_progress' ? 'warning' : 'scheduled'}`}>{status}</span>
      </header>

      <section className="workspace-summary">
        <div>
          <strong>Parent snapshots</strong>
          <span>{litter.parents.map((parent) => `${parent.sex} ${parent.genotype} · ${fmt(parent.dob)}`).join(' / ')}</span>
        </div>
        <div>
          <strong>Genotype window</strong>
          <span>{litter.genotypeRequired ? `${format(parseISO(dates.genotypeStart), 'MMM d')}-${format(parseISO(dates.genotypeEnd), 'MMM d')}` : 'Not required'}</span>
        </div>
        <div>
          <strong>Tattoo numbers</strong>
          <span>#1-#{litter.pupCount}</span>
        </div>
      </section>

      <GenotypePanel litter={litter} onSave={onSave} />
      <WeanPanel litter={litter} onTransfer={onTransfer} />
    </div>
  )
}
