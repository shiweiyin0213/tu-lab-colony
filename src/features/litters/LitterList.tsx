import { format, parseISO } from 'date-fns'
import type { LitterRecord } from '../../domain/colony'
import { getLitterStatus, litterDates } from '../../domain/litterRules'
import { fmt } from '../../utils'
import './litters.css'

interface LitterListProps {
  rows: LitterRecord[]
  onOpen: (litterId: string) => void
  mode?: 'all' | 'genotype'
  onNewLitter?: () => void
}

export function LitterList({ rows, onOpen, mode = 'all', onNewLitter }: LitterListProps) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const genotypeMode = mode === 'genotype'

  return (
    <div className="litter-list">
      <div className="table-toolbar">
        <span>{rows.length} litters</span>
        <span>{genotypeMode ? 'Open any litter to upload old or current gel evidence' : 'Genotype, sex, and wean transfer stay together in one workspace'}</span>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">
          <strong>{genotypeMode ? 'No litter workspaces yet' : 'No litters recorded yet'}</strong>
          <span>{genotypeMode ? 'Create a litter workspace for the old or current litter, then upload the gel image and tattoo-number genotype map.' : 'Use New litter to create tattoo numbers and reminder dates.'}</span>
          {genotypeMode && onNewLitter && <button className="button primary" onClick={onNewLitter}>Create litter workspace</button>}
        </div>
      ) : (
        <div className="litter-cards">
          {rows.map((litter) => {
            const dates = litterDates(litter.dob)
            const status = getLitterStatus(litter, today)
            return (
              <article className="litter-card" key={litter.id}>
                <div>
                  <span className="eyebrow">{litter.line} · breeding cage {litter.breedingCageLabel}</span>
                  <h2><button className="litter-open" onClick={() => onOpen(litter.id)}>{litter.reference}</button></h2>
                </div>
                <div className="litter-facts">
                  <span>DOB: {fmt(litter.dob)}</span>
                  <span>{litter.pupCount} pups</span>
                  <span>#1-#{litter.pupCount}</span>
                  <span>{litter.genotypeRequired ? `P4-P11: ${format(parseISO(dates.genotypeStart), 'MMM d')}-${format(parseISO(dates.genotypeEnd), 'MMM d')}` : 'Genotype not required'}</span>
                  <span>P21: {format(parseISO(dates.weanDate), 'MMM d, yyyy')}</span>
                </div>
                <div className="litter-footer">
                  <span className={`badge ${status === 'wean_attention' ? 'urgent' : status === 'genotype_due' ? 'warning' : 'scheduled'}`}>{status}</span>
                  <span>{litter.parents.map((parent) => `${parent.sex} ${parent.genotype} ${parent.dob}`).join(' · ')}</span>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
