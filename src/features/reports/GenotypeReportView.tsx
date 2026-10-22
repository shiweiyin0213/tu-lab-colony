import { format } from 'date-fns'
import { Copy, Printer, RefreshCw, X } from 'lucide-react'
import { Cell, Pie, PieChart, Tooltip } from 'recharts'
import type { GenotypeReport, GenotypeReportLine } from '../../domain/genotypeReport'
import './genotype-report.css'

interface GenotypeReportViewProps {
  report: GenotypeReport
  onClose: () => void
  onCopy: () => void
  onPrint: () => void
  onRefresh: () => void
}

const inventoryOrder = ['WT', 'HET', 'KO', 'RGS2 WT', 'Prex KO', 'Mixed', 'Unknown'] as const
const sexOrder = ['Male', 'Female', 'Mixed', 'Unknown'] as const
const genotypeColors: Record<(typeof inventoryOrder)[number], string> = {
  WT: '#258064',
  HET: '#d89a28',
  KO: '#3f6fb6',
  'RGS2 WT': '#744f9a',
  'Prex KO': '#d15d57',
  Mixed: '#687872',
  Unknown: '#a5ada9',
}
const ageColors = ['#52a98a', '#e3b249', '#4f7fb8', '#8b67a8', '#d16a62']
const ageShortLabels: Record<string, string> = {
  underSixWeeks: '<6w',
  experimentReady: '6-8w',
  adultToSixMonths: '8w-6m',
  sixMonthsToOneYear: '6-12m',
  overOneYear: '>1y',
}

function CageDetailList({ line }: { line: GenotypeReportLine }) {
  return (
    <ul>
      {line.individualByAge.length
        ? line.individualByAge.map((item) => (
          <li key={`${item.cage}-${item.dob}`}>
            <span>
              <b>Cage {item.cage}</b>
              {` · ${item.genotype} · ${item.sex} · ${item.count} ${item.count === 1 ? 'mouse' : 'mice'} · DOB ${format(new Date(`${item.dob}T00:00:00`), 'MMM d, yyyy')}`}
            </span>
            <strong>{item.age}</strong>
          </li>
        ))
        : <li><span>No individual cages</span></li>}
    </ul>
  )
}

export function GenotypeReportView({ report, onClose, onCopy, onPrint, onRefresh }: GenotypeReportViewProps) {
  return (
    <div className="genotype-report-backdrop" role="presentation">
      <section className="genotype-report-dialog" role="dialog" aria-modal="true" aria-labelledby="genotype-report-title">
        <header className="genotype-report-header">
          <div>
            <span className="eyebrow">CURRENT COLONY INVENTORY</span>
            <h1 id="genotype-report-title">Genotype summary</h1>
            <p>Generated {format(new Date(report.generatedAt), 'MMM d, yyyy, h:mm a')}</p>
          </div>
          <button className="icon-button" aria-label="Close genotype report" title="Close genotype report" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="genotype-report-controls">
          <button className="button secondary" onClick={onRefresh}><RefreshCw size={16} />Refresh report</button>
          <button className="button secondary" onClick={onCopy}><Copy size={16} />Copy report</button>
          <button className="button primary" onClick={onPrint}><Printer size={16} />Print / Save PDF</button>
        </div>

        <div className="genotype-report-body">
          <section className="genotype-report-totals" aria-label="Colony genotype totals">
            <div><strong>{report.totals.activeLines}</strong><span>Active lines</span></div>
            <div><strong>{report.totals.breedingCages}</strong><span>Breeding cages</span></div>
            <div><strong>{report.totals.individualCages}</strong><span>Individual cages</span></div>
            <div><strong>{report.totals.individualMice}</strong><span>{report.totals.individualMice} mice recorded</span></div>
            <div><strong>{report.totals.pendingGenotypePups}</strong><span>Pending genotype</span></div>
          </section>

          <div className="genotype-report-tree">
            {report.lines.map((line) => {
              const hasAttention = Object.values(line.attention).some((count) => count > 0)
              const donutData = inventoryOrder
                .map((name) => ({ name, value: line.genotypeCounts[name] }))
                .filter((item) => item.value > 0)
              const populatedAgeBuckets = line.ageBuckets.filter((bucket) => bucket.count > 0)
              return (
                <section className="genotype-report-line" aria-label={`${line.line} genotype summary`} key={line.line}>
                  <div className="genotype-report-line-heading">
                    <h2>{line.line}</h2>
                    <span>{line.individualMice} mice</span>
                  </div>

                  <div className="genotype-report-visuals">
                    <section className="genotype-donut-section">
                      <div className="report-visual-heading">
                        <div><span>INDIVIDUAL INVENTORY</span><strong>Genotype mix</strong></div>
                        <span>{line.individualCages} cages</span>
                      </div>
                      <div className="genotype-donut-layout">
                        <div className="genotype-donut" role="img" aria-label={`${line.line} genotype distribution`}>
                          <PieChart width={210} height={210}>
                            <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={94} paddingAngle={2} stroke="none" isAnimationActive={false}>
                              {donutData.map((item) => <Cell key={item.name} fill={genotypeColors[item.name]} />)}
                            </Pie>
                            <Tooltip
                              content={({ active, payload }) => active && payload?.length ? (
                                <div className="genotype-chart-tooltip">
                                  <strong>{payload[0].name}</strong>
                                  <span>{payload[0].value} mice</span>
                                </div>
                              ) : null}
                            />
                            <text x="105" y="98" textAnchor="middle" className="donut-total">{line.individualMice}</text>
                            <text x="105" y="119" textAnchor="middle" className="donut-caption">MICE</text>
                          </PieChart>
                        </div>
                        <div className="genotype-donut-legend">
                          {donutData.map((item) => (
                            <div key={item.name}>
                              <i style={{ background: genotypeColors[item.name] }} />
                              <span>{item.name}</span>
                              <strong>{item.value}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>

                    <section className="genotype-age-section">
                      <div className="report-visual-heading">
                        <div><span>AGE DISTRIBUTION</span><strong>Youngest to oldest</strong></div>
                        <span>{line.individualMice} mice</span>
                      </div>
                      <div className="genotype-age-chart" role="img" aria-label={`${line.line} age distribution`}>
                        <div className="genotype-age-bar">
                          {populatedAgeBuckets.map((bucket) => {
                            const index = line.ageBuckets.findIndex((item) => item.id === bucket.id)
                            return <span key={bucket.id} style={{ background: ageColors[index], flexGrow: bucket.count }} title={`${bucket.label}: ${bucket.count} mice`} />
                          })}
                        </div>
                        <div className="genotype-age-legend">
                          {line.ageBuckets.map((bucket, index) => (
                            <div className={bucket.count ? '' : 'empty'} key={bucket.id}>
                              <i style={{ background: ageColors[index] }} />
                              <strong>{bucket.count}</strong>
                              <span>{ageShortLabels[bucket.id]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="genotype-sex-strip">
                        {sexOrder.filter((value) => line.sexCounts[value] > 0).map((value) => (
                          <span key={value}><b>{line.sexCounts[value]}</b>{value}</span>
                        ))}
                      </div>
                    </section>
                  </div>

                  <div className="genotype-report-branches">
                    <section>
                      <h3>Breeding</h3>
                      <strong>{line.breedingCages} cages</strong>
                      <ul>
                        {line.pairings.length
                          ? line.pairings.map((item) => <li key={item.pairing}><span>{item.pairing}</span><b>{item.count}</b></li>)
                          : <li><span>No breeding cages</span></li>}
                      </ul>
                    </section>

                    <section>
                      <h3>Individual cages</h3>
                      <strong>{line.individualCages} cages, {line.individualMice} mice</strong>
                      <details className="genotype-report-age">
                        <summary>Show cage details</summary>
                        <CageDetailList line={line} />
                      </details>
                    </section>

                    <section>
                      <h3>Pending genotype</h3>
                      <strong>{line.pendingGenotypePups} pups</strong>
                      <ul>
                        {line.pendingSources.length
                          ? line.pendingSources.map((source) => <li key={source.label}><span>{source.label}</span><b>{source.count}</b></li>)
                          : <li><span>No pending pups</span></li>}
                      </ul>
                    </section>

                    <section className={hasAttention ? 'report-attention' : ''}>
                      <h3>Attention</h3>
                      <strong>{hasAttention ? 'Review needed' : 'No data gaps'}</strong>
                      <ul>
                        <li><span>Unknown genotype</span><b>{line.attention.unknownGenotypeMice}</b></li>
                        <li><span>Unknown sex</span><b>{line.attention.unknownSexMice}</b></li>
                        <li><span>Incomplete mixed map</span><b>{line.attention.incompleteMixedMapMice}</b></li>
                      </ul>
                    </section>
                  </div>

                  <section className="genotype-report-age-print">
                    <div>
                      <h3>Individual cage details</h3>
                      <span>Youngest to oldest</span>
                    </div>
                    <CageDetailList line={line} />
                  </section>
                </section>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
