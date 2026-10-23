import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  BookOpenText,
  CalendarDays,
  ChevronDown,
  CirclePlus,
  ClipboardList,
  Cloud,
  Download,
  FileSpreadsheet,
  FlaskConical,
  LayoutDashboard,
  MailCheck,
  Menu,
  MousePointer2,
  Network,
  Pencil,
  Printer,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import readExcelFile from 'read-excel-file/browser'
import { format, parseISO } from 'date-fns'
import type { BreedingCage, ColonyData, Genotype, GenotypeProtocol, IndividualCage, Sex, WorkEntry } from './types'
import type { LitterRecord, WeanGroupDraft } from './domain/colony'
import { loadColonyData, saveColonyData } from './data/colonyRepository'
import {
  loadProductionColonyData,
  saveProductionColonyChanges,
  subscribeToProductionColonyData,
} from './data/productionColonyRepository'
import { saveAttachment, validateAttachment } from './data/attachmentRepository'
import { LitterList } from './features/litters/LitterList'
import { LitterWorkspace } from './features/litters/LitterWorkspace'
import { NewLitterDialog } from './features/litters/NewLitterDialog'
import { buildGenotypeReport, serializeGenotypeReport } from './domain/genotypeReport'
import {
  approveAccessRequest,
  createOwnerWorkspace,
  getProductionConnections,
  registerUser,
  removeWorkspaceMember,
  requestAccess,
  searchWorkspaces,
  type AccountUser,
  type LabWorkspace,
  type ProductionConnection,
} from './domain/account'
import {
  approveWorkspaceAccess,
  canViewColonyData,
  createInitialAuthState,
  createLabAccessRequest,
  loadAuthState,
  markEmailVerified,
  registerAuthUser,
  saveAuthState,
  type AuthSessionState,
  type LabDirectoryEntry,
} from './domain/authFlow'
import { buildImportProfile } from './domain/importProfile'
import { getLitterStatus, litterDates, transferLitter } from './domain/litterRules'
import {
  archiveColonyLine,
  deleteColonyLine,
  getActiveColonyLines,
  getArchivedColonyLines,
  getColonyLineSummary,
  restoreColonyLine,
} from './domain/colonyLines'
import { getProductionConfig } from './services/productionConfig'
import {
  getCurrentSession,
  loadCurrentLabMemberships,
  resetPasswordForEmail,
  requestLabAccess as requestProductionLabAccess,
  searchProductionLabs,
  signInWithEmail,
  signInWithGoogle,
  signOut as productionSignOut,
  signUpWithEmail,
  updatePassword,
  type ProductionLab,
} from './services/productionAuth'
import { ageLabel, breederAlert, downloadIcs, fmt, genotypeWindow, individualAgeBucketId, individualAgeSexSummary, isDueSoon, weanDate, weanStatus, type IndividualAgeBucketId } from './utils'
import './App.css'

const GenotypeReportView = lazy(() => import('./features/reports/GenotypeReportView')
  .then((module) => ({ default: module.GenotypeReportView })))

type View = 'dashboard' | 'litters' | 'breeding' | 'individual' | 'protocols' | 'work' | 'account'
type IndividualDashboardFilter = {
  bucketId: IndividualAgeBucketId
  bucketLabel: string
  genotype?: Genotype
  sex?: Sex
}

type GenotypeInventoryAlert = {
  line: string
  genotype: Genotype
  count: number
  tone: 'urgent' | 'warning'
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return fallback
}

const views: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'litters', label: 'Litters', icon: FlaskConical },
  { id: 'breeding', label: 'Breeding cages', icon: Users },
  { id: 'individual', label: 'Individual cages', icon: MousePointer2 },
  { id: 'protocols', label: 'Genotype protocols', icon: BookOpenText },
  { id: 'work', label: 'Work log', icon: ClipboardList },
  { id: 'account', label: 'Account', icon: ShieldCheck },
]

const genotypeDisplayOrder: Genotype[] = ['WT', 'HET', 'KO', 'RGS2 WT', 'Prex KO', 'Mixed', 'Unknown']
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const tuLabDirectoryEntry: LabDirectoryEntry = { id: 'tu-lab', name: 'Yaping Tu Lab', institution: 'TU Lab private workspace' }

const knownBreedingColumns = new Set([
  'Cage',
  'Pairing',
  'Male genotype',
  'Male DOB',
  'Female genotype',
  'Female DOB',
  'Extra female',
  'Pups DOB',
  'Pups count',
  'Genotype needed?',
  'Priority',
  'Special attention',
  'Notes',
])

const knownIndividualColumns = new Set([
  'Cage',
  'Genotype',
  'Genotype group',
  'Sex',
  'DOB',
  'Count',
  'Current count',
  'Genotype by mouse number',
  'Notes',
])

function excelDate(value: unknown) {
  if (value instanceof Date) return format(value, 'yyyy-MM-dd')
  if (typeof value === 'string') {
    const match = value.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
    if (match) {
      const year = match[3].length === 2 ? `20${match[3]}` : match[3]
      return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  }
  return ''
}

function rowsToObjects(rows: unknown[][]) {
  const [headerRow = [], ...dataRows] = rows
  const headers = headerRow.map((cell) => String(cell ?? '').trim())

  return dataRows.map((row) => Object.fromEntries(
    headers.map((header, index) => [header, row[index] ?? '']),
  ))
}

function genotype(value: unknown): Genotype {
  const text = String(value ?? '').trim()
  if (text.includes('RGS2')) return 'RGS2 WT'
  if (text.includes('Prex')) return 'Prex KO'
  if (text === 'WT' || text === 'HET' || text === 'KO' || text === 'Mixed') return text
  return 'Unknown'
}

function normalizeMappedGenotype(value: string): Genotype {
  const normalized = value.toUpperCase().replace(/\s+/g, ' ').trim()
  if (normalized === 'RGS2 WT') return 'RGS2 WT'
  if (normalized === 'PREX KO') return 'Prex KO'
  if (normalized === 'WT' || normalized === 'HET' || normalized === 'KO') return normalized
  return 'Unknown'
}

function cageHasGenotype(cage: IndividualCage, genotypeValue: Genotype) {
  if (cage.genotype === genotypeValue) return true
  if (!cage.genotypeMap) return false

  return Array.from(cage.genotypeMap.matchAll(/((?:#\s*\d+\s*)+)\s*(RGS2\s*WT|Prex\s*KO|WT|HET|KO|Unknown)\b/gi))
    .some((match) => normalizeMappedGenotype(match[2]) === genotypeValue)
}

function genotypeCountsForCage(cage: IndividualCage): Partial<Record<Genotype, number>> {
  if (cage.genotype !== 'Mixed' || !cage.genotypeMap) return { [cage.genotype]: cage.count }

  const counts: Partial<Record<Genotype, number>> = {}
  const matches = Array.from(cage.genotypeMap.matchAll(/((?:#\s*\d+\s*)+)\s*(RGS2\s*WT|Prex\s*KO|WT|HET|KO|Unknown)\b/gi))
  matches.forEach((match) => {
    const mouseCount = Array.from(match[1].matchAll(/#\s*\d+/g)).length
    const mappedGenotype = normalizeMappedGenotype(match[2])
    counts[mappedGenotype] = (counts[mappedGenotype] ?? 0) + mouseCount
  })

  const parsedCount = Object.values(counts).reduce((sum, count = 0) => sum + count, 0)
  if (!parsedCount) return { Unknown: cage.count }
  return counts
}

function individualCageSortValue(cageLabel: string) {
  const matches = cageLabel.match(/\d+/g)
  if (!matches?.length) return Number.POSITIVE_INFINITY
  return Number(matches[matches.length - 1])
}

function sortIndividualCages(cages: IndividualCage[]) {
  return [...cages].sort((a, b) => {
    const lineCompare = a.line.localeCompare(b.line, undefined, { numeric: true, sensitivity: 'base' })
    if (lineCompare) return lineCompare
    const numberCompare = individualCageSortValue(a.cage) - individualCageSortValue(b.cage)
    if (numberCompare) return numberCompare
    return a.cage.localeCompare(b.cage, undefined, { numeric: true, sensitivity: 'base' })
  })
}

function renumberIndividualCages(cages: IndividualCage[], line?: string) {
  const targetLines = line ? [line] : Array.from(new Set(cages.map((cage) => cage.line)))
  const nextById = new Map<string, string>()

  targetLines.forEach((targetLine) => {
    sortIndividualCages(cages.filter((cage) => cage.line === targetLine))
      .forEach((cage, index) => nextById.set(cage.id, String(index + 1)))
  })

  return cages.map((cage) => nextById.has(cage.id) ? { ...cage, cage: nextById.get(cage.id)! } : cage)
}

function matchesIndividualDashboardFilter(cage: IndividualCage, filter: IndividualDashboardFilter, todayIso: string) {
  if (individualAgeBucketId(cage.dob, todayIso) !== filter.bucketId) return false
  if (filter.genotype && !cageHasGenotype(cage, filter.genotype)) return false
  if (filter.sex && cage.sex !== filter.sex) return false
  return true
}

function extractCustomFields(row: Record<string, unknown>, knownColumns: Set<string>) {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key, value]) => key && !knownColumns.has(key) && value !== undefined && value !== null && String(value).trim())
      .map(([key, value]) => [key, String(value).trim()]),
  )
}

function customSearchText(customFields?: Record<string, string>) {
  return Object.entries(customFields ?? {})
    .flatMap(([field, value]) => [field, value])
    .join(' ')
}

function App() {
  const [authState, setAuthState] = useState<AuthSessionState>(loadAuthState)
  const [data, setDataState] = useState<ColonyData>(loadColonyData)
  const [view, setView] = useState<View>('dashboard')
  const [activeLine, setActiveLine] = useState('All lines')
  const [query, setQuery] = useState('')
  const [individualDashboardFilter, setIndividualDashboardFilter] = useState<IndividualDashboardFilter | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showLitter, setShowLitter] = useState(false)
  const [showEuthanasia, setShowEuthanasia] = useState(false)
  const [showProtocol, setShowProtocol] = useState(false)
  const [showGenotypeReport, setShowGenotypeReport] = useState(false)
  const [reportGeneratedAt, setReportGeneratedAt] = useState(() => new Date())
  const [manualCageForm, setManualCageForm] = useState<null | 'breeding' | 'individual'>(null)
  const [editingBreedingCage, setEditingBreedingCage] = useState<BreedingCage | null>(null)
  const [editingIndividualCage, setEditingIndividualCage] = useState<IndividualCage | null>(null)
  const [editingProtocol, setEditingProtocol] = useState<GenotypeProtocol | null>(null)
  const [litterMode, setLitterMode] = useState<'all' | 'genotype'>('all')
  const [selectedLitterId, setSelectedLitterId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)
  const [managedLine, setManagedLine] = useState<string | null>(null)
  const [lineDialogMode, setLineDialogMode] = useState<'manage' | 'delete'>('manage')
  const [workspace, setWorkspace] = useState<LabWorkspace>(() => createOwnerWorkspace('shiwei@gmail.com', 'Shiwei Yin', '2026-06-20'))
  const [testUser, setTestUser] = useState<AccountUser | null>(null)
  const [testUserName, setTestUserName] = useState('New lab member')
  const [testUserEmail, setTestUserEmail] = useState('member@gmail.com')
  const [workspaceQuery, setWorkspaceQuery] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const toastTimerRef = useRef<number | null>(null)
  const cloudSaveQueueRef = useRef<Promise<ColonyData | undefined>>(Promise.resolve(undefined))
  const cloudSaveRevisionRef = useRef(0)
  const pendingCloudSavesRef = useRef(0)
  const cloudDataLoadedForRef = useRef<string | null>(null)
  const cloudDataRevisionRef = useRef(0)
  const productionConnections = getProductionConnections({
    googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    stripePriceId: import.meta.env.VITE_STRIPE_PRICE_ID,
  })
  const productionConfig = getProductionConfig()
  const supabaseReady = productionConfig.supabaseReady
  const hasProductionWorkspace = Boolean(authState.selectedWorkspaceId && uuidPattern.test(authState.selectedWorkspaceId))
  const canUseWorkspace = canViewColonyData(authState) && (!supabaseReady || hasProductionWorkspace)
  const passwordRecoveryRequested = window.location.pathname === '/auth/reset-password'

  const setAuth = (next: AuthSessionState) => {
    setAuthState(next)
    saveAuthState(next)
  }

  const logOut = async () => {
    if (supabaseReady) await productionSignOut().catch(() => undefined)
    cloudDataLoadedForRef.current = null
    setAuth(createInitialAuthState())
  }

  const setData = (next: ColonyData) => {
    const base = data
    cloudDataRevisionRef.current += 1
    setDataState(next)
    saveColonyData(next)
    if (supabaseReady && authState.status === 'workspace_approved' && authState.selectedWorkspaceId && uuidPattern.test(authState.selectedWorkspaceId)) {
      const workspaceId = authState.selectedWorkspaceId
      const revision = ++cloudSaveRevisionRef.current
      pendingCloudSavesRef.current += 1
      const queuedSave = cloudSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          return saveProductionColonyChanges(workspaceId, base, next)
        })
      cloudSaveQueueRef.current = queuedSave
      queuedSave
        .then((savedData) => {
          if (cloudSaveRevisionRef.current === revision) {
            cloudDataRevisionRef.current += 1
            setDataState(savedData)
            saveColonyData(savedData)
          }
        })
        .catch((error: Error) => {
          setToast(`Cloud save failed: ${error.message}`)
        })
        .finally(() => {
          pendingCloudSavesRef.current = Math.max(0, pendingCloudSavesRef.current - 1)
        })
    }
  }

  useEffect(() => {
    if (!supabaseReady) return
    if (authState.status !== 'workspace_approved' || !authState.selectedWorkspaceId) return
    if (!uuidPattern.test(authState.selectedWorkspaceId)) {
      const resetTimer = window.setTimeout(() => setAuth(createInitialAuthState()), 0)
      return () => window.clearTimeout(resetTimer)
    }
    const workspaceId = authState.selectedWorkspaceId
    let alive = true
    let loading = false

    const refreshCloudData = async () => {
      if (loading || pendingCloudSavesRef.current > 0) return
      loading = true
      const revisionAtStart = cloudDataRevisionRef.current
      try {
        const session = await getCurrentSession()
        if (!alive) return
        if (!session) {
          setSessionExpired(true)
          setToast('Cloud session expired. Please sign in again to sync latest colony data.')
          return
        }
        setSessionExpired(false)

        const cloudData = await loadProductionColonyData(workspaceId)
        if (!alive) return
        if (cloudData && revisionAtStart === cloudDataRevisionRef.current && pendingCloudSavesRef.current === 0) {
          setDataState(cloudData)
          saveColonyData(cloudData)
        } else {
          setToast('Cloud colony snapshot was not found. Please contact an owner before editing.')
          return
        }
        cloudDataLoadedForRef.current = workspaceId
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (alive) setToast(`Cloud load failed: ${message}`)
      } finally {
        loading = false
      }
    }

    if (cloudDataLoadedForRef.current !== workspaceId) void refreshCloudData()

    const unsubscribe = subscribeToProductionColonyData(workspaceId, (cloudData) => {
      if (!alive) return
      cloudDataRevisionRef.current += 1
      if (pendingCloudSavesRef.current > 0) return
      setDataState(cloudData)
      saveColonyData(cloudData)
      cloudDataLoadedForRef.current = workspaceId
    })

    const handleFocus = () => { void refreshCloudData() }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshCloudData()
    }
    window.addEventListener('focus', handleFocus)
    window.addEventListener('online', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    const pollingTimer = window.setInterval(refreshCloudData, 15_000)

    return () => {
      alive = false
      unsubscribe()
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('online', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(pollingTimer)
    }
  }, [authState.status, authState.selectedWorkspaceId, supabaseReady])

  const restartExpiredSession = () => {
    setSessionExpired(false)
    cloudDataLoadedForRef.current = null
    setAuth(createInitialAuthState())
  }

  useEffect(() => () => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  const lines = useMemo(() => ['All lines', ...getActiveColonyLines(data)], [data])
  const archivedLines = useMemo(() => getArchivedColonyLines(data), [data])

  const openLineManager = (line: string) => {
    setManagedLine(line)
    setLineDialogMode('manage')
  }

  const archiveLine = (line: string) => {
    setData(archiveColonyLine(data, line))
    if (activeLine === line) setActiveLine('All lines')
    setManagedLine(null)
    flash(`${line} archived`)
  }

  const restoreLine = (line: string) => {
    setData(restoreColonyLine(data, line))
    flash(`${line} restored`)
  }

  const permanentlyDeleteLine = (line: string) => {
    setData(deleteColonyLine(data, line))
    if (activeLine === line) setActiveLine('All lines')
    setManagedLine(null)
    setLineDialogMode('manage')
    flash(`${line} and its linked records were deleted`)
  }

  const lineBreeding = useMemo(
    () => activeLine === 'All lines' ? data.breeding : data.breeding.filter((cage) => cage.line === activeLine),
    [activeLine, data.breeding],
  )

  const lineIndividual = useMemo(
    () => sortIndividualCages(activeLine === 'All lines' ? data.individual : data.individual.filter((cage) => cage.line === activeLine)),
    [activeLine, data.individual],
  )

  const lineWork = useMemo(
    () => activeLine === 'All lines' ? data.work : data.work.filter((entry) => entry.line === activeLine),
    [activeLine, data.work],
  )

  const lineLitters = useMemo(
    () => activeLine === 'All lines' ? data.litters : data.litters.filter((litter) => litter.line === activeLine),
    [activeLine, data.litters],
  )

  const lineProtocols = useMemo(
    () => activeLine === 'All lines' ? data.protocols : data.protocols.filter((protocol) => protocol.line === activeLine),
    [activeLine, data.protocols],
  )

  const todayIso = format(new Date(), 'yyyy-MM-dd')

  const breeding = useMemo(() => {
    const normalized = query.toLowerCase()
    return lineBreeding.filter((cage) => {
      const inSearch = !normalized || [cage.line, cage.cage, cage.pairing, cage.maleDob, cage.femaleDob, cage.notes, cage.extraFemale]
        .concat(customSearchText(cage.customFields))
        .join(' ')
        .toLowerCase()
        .includes(normalized)
      return inSearch
    })
  }, [lineBreeding, query])

  const individual = useMemo(() => {
    const normalized = query.toLowerCase()
    return lineIndividual.filter((cage) => {
      if (individualDashboardFilter && !matchesIndividualDashboardFilter(cage, individualDashboardFilter, todayIso)) return false
      const inSearch = !normalized || [cage.line, cage.cage, cage.genotype, cage.sex, cage.dob, cage.genotypeMap, cage.notes]
        .concat(customSearchText(cage.customFields))
        .join(' ')
        .toLowerCase()
        .includes(normalized)
      return inSearch
    })
  }, [individualDashboardFilter, lineIndividual, query, todayIso])

  const work = useMemo(() => {
    const normalized = query.toLowerCase()
    return lineWork
      .filter((entry) => !normalized || Object.values(entry).join(' ').toLowerCase().includes(normalized))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [lineWork, query])

  const litters = useMemo(() => {
    const normalized = query.toLowerCase()
    return lineLitters
      .filter((litter) => !normalized || [
        litter.reference,
        litter.line,
        litter.breedingCageLabel,
        litter.dob,
        litter.parents.map((parent) => `${parent.sex} ${parent.genotype} ${parent.dob}`).join(' '),
      ].join(' ').toLowerCase().includes(normalized))
      .sort((a, b) => b.dob.localeCompare(a.dob))
  }, [lineLitters, query])

  const protocols = useMemo(() => {
    const normalized = query.toLowerCase()
    return lineProtocols
      .filter((protocol) => !normalized || [
        protocol.line,
        protocol.name,
        protocol.targetGene,
        protocol.primers,
        protocol.pcrReactionSystem,
        protocol.pcrProgram,
        protocol.expectedBands,
        protocol.notes,
        protocol.attachments?.map((attachment) => attachment.originalName).join(' '),
      ].join(' ').toLowerCase().includes(normalized))
      .sort((a, b) => a.line.localeCompare(b.line) || a.name.localeCompare(b.name))
  }, [lineProtocols, query])
  const visibleLitters = litters

  const due = useMemo(() => lineBreeding.filter(isDueSoon), [lineBreeding])
  const litterStatuses = lineLitters.map((litter) => getLitterStatus(litter, todayIso))
  const genotypeDue = litterStatuses.filter((status) => status === 'genotype_due' || status === 'genotype_in_progress').length
  const awaitingSex = litterStatuses.filter((status) => status === 'awaiting_sex' || status === 'wean_attention').length
  const genotypeSchedule = useMemo(() => lineLitters
    .filter((litter) => {
      if (!litter.genotypeRequired) return false
      const status = getLitterStatus(litter, todayIso)
      return status === 'new' || status === 'genotype_due' || status === 'genotype_in_progress' || status === 'wean_attention'
    })
    .sort((a, b) => litterDates(a.dob).genotypeStart.localeCompare(litterDates(b.dob).genotypeStart))
    .slice(0, 8), [lineLitters, todayIso])
  const oldBreeders = useMemo(
    () => lineBreeding.reduce((sum, cage) => sum + Number(breederAlert(cage.maleDob)) + Number(breederAlert(cage.femaleDob)), 0),
    [lineBreeding],
  )
  const mouseCount = lineIndividual.reduce((sum, cage) => sum + cage.count, 0)
  const mixedCount = lineIndividual.filter((cage) => cage.genotype === 'Mixed').length
  const dashboardLines = activeLine === 'All lines' ? lines.slice(1) : [activeLine]
  const lineInventoryMax = Math.max(1, ...dashboardLines.flatMap((line) => [
    data.breeding.filter((cage) => cage.line === line).length,
    data.individual.filter((cage) => cage.line === line).length,
  ]))
  const ageAvailability = individualAgeSexSummary(lineIndividual, todayIso)
  const genotypeInventoryAlerts = useMemo<GenotypeInventoryAlert[]>(() => {
    const trackedGenotypes: Genotype[] = ['WT', 'KO']
    return dashboardLines.flatMap((line) => {
      const counts = Object.fromEntries(trackedGenotypes.map((item) => [item, 0])) as Record<Genotype, number>
      data.individual
        .filter((cage) => cage.line === line)
        .forEach((cage) => {
          const cageCounts = genotypeCountsForCage(cage)
          trackedGenotypes.forEach((item) => {
            counts[item] += cageCounts[item] ?? 0
          })
        })

      return trackedGenotypes
        .filter((genotype) => counts[genotype] < 3)
        .map((genotype) => ({
          line,
          genotype,
          count: counts[genotype],
          tone: counts[genotype] === 0 ? 'urgent' : 'warning',
        }))
    })
  }, [dashboardLines, data.individual])

  const openIndividualDashboardFilter = (filter: IndividualDashboardFilter) => {
    setIndividualDashboardFilter(filter)
    setQuery('')
    setView('individual')
    setSidebarOpen(false)
  }

  const openGenotypeInventoryAlert = (alert: GenotypeInventoryAlert) => {
    setActiveLine(alert.line)
    setIndividualDashboardFilter(null)
    setQuery(alert.genotype)
    setView('individual')
    setSidebarOpen(false)
  }
  const importProfile = useMemo(() => buildImportProfile([...lineBreeding, ...lineIndividual]), [lineBreeding, lineIndividual])
  const selectedLitter = data.litters.find((litter) => litter.id === selectedLitterId)

  const openGenotypeWork = () => {
    setView('litters')
    setLitterMode('genotype')
    setSelectedLitterId(null)
  }

  const registerTestUser = () => {
    const nextUser = registerUser(testUserName, testUserEmail)
    setTestUser(nextUser)
    flash(`Verification email queued for ${nextUser.email}`)
  }

  const requestWorkspaceAccess = () => {
    if (!testUser) return
    setWorkspace(requestAccess(workspace, testUser))
    flash('Access request sent')
  }

  const approveViewerAccess = () => {
    const pending = workspace.requests.find((request) => request.status === 'Pending')
    if (!pending) return
    setWorkspace(approveAccessRequest(workspace, pending.id, workspace.ownerEmail))
    flash('Viewer approved')
  }

  const removeViewerAccess = (memberId: string) => {
    setWorkspace(removeWorkspaceMember(workspace, memberId, workspace.ownerEmail))
    flash('Viewer removed')
  }

  const flash = (message: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current)
    }
    setToast(message)
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2600)
  }

  const genotypeReport = useMemo(
    () => buildGenotypeReport(data, reportGeneratedAt),
    [data, reportGeneratedAt],
  )

  const openGenotypeReport = () => {
    setReportGeneratedAt(new Date())
    setShowGenotypeReport(true)
  }

  const copyGenotypeReport = async () => {
    try {
      await navigator.clipboard.writeText(serializeGenotypeReport(genotypeReport))
      flash('Genotype report copied.')
    } catch {
      flash('Could not copy genotype report.')
    }
  }

  const handleImport = async (file?: File) => {
    if (!file) return
    const workbook = await readExcelFile(file)
    const next: ColonyData = { breeding: [], individual: [], work: [], litters: [], protocols: [] }

    workbook.forEach(({ sheet: sheetName, data: sheetData }) => {
      const rows = rowsToObjects(sheetData)
      const line = sheetName.replace(/\s+(Breeding|Individual).*$/i, '').replace('Prex1', 'Prex1').trim()
      if (/Breeding/i.test(sheetName)) {
        rows.forEach((row, index) => {
          if (!row.Cage || !row.Pairing) return
          next.breeding.push({
            id: `import-b-${sheetName}-${index}-${Date.now()}`,
            line,
            cage: String(row.Cage),
            pairing: String(row.Pairing),
            maleGenotype: genotype(row['Male genotype']),
            maleDob: excelDate(row['Male DOB']),
            femaleGenotype: genotype(row['Female genotype']),
            femaleDob: excelDate(row['Female DOB']),
            extraFemale: String(row['Extra female'] || '') || undefined,
            pupsDob: excelDate(row['Pups DOB']) || undefined,
            pupsCount: Number(row['Pups count']) || undefined,
            genotypeNeeded: String(row['Genotype needed?']).toLowerCase() === 'yes',
            priority: String(row.Priority).toLowerCase() === 'yes',
            notes: [row['Special attention'], row.Notes].filter(Boolean).join(' '),
            customFields: extractCustomFields(row, knownBreedingColumns),
          })
        })
      }
      if (/Individual/i.test(sheetName)) {
        rows.forEach((row, index) => {
          if (!row.Cage || !(row.Genotype || row['Genotype group'])) return
          next.individual.push({
            id: `import-i-${sheetName}-${index}-${Date.now()}`,
            line,
            cage: String(row.Cage),
            genotype: genotype(row.Genotype || row['Genotype group']),
            sex: (String(row.Sex || 'Unknown') as Sex),
            dob: excelDate(row.DOB),
            count: Number(row.Count || row['Current count']) || 1,
            genotypeMap: String(row['Genotype by mouse number'] || '') || undefined,
            notes: String(row.Notes || '') || undefined,
            customFields: extractCustomFields(row, knownIndividualColumns),
          })
        })
      }
      if (/Work Log/i.test(sheetName)) {
        rows.forEach((row, index) => {
          if (!row.Description) return
          next.work.push({
            id: `import-w-${index}-${Date.now()}`,
            line: String(row.Line || line || 'Imported'),
            cage: String(row.Cage || ''),
            date: excelDate(row.Date) || format(new Date(), 'yyyy-MM-dd'),
            type: String(row['Work type'] || 'Imported'),
            description: String(row.Description),
            followUpDate: excelDate(row['Follow-up date']) || undefined,
          })
        })
      }
    })

    if (!next.breeding.length && !next.individual.length) {
      flash('No colony sheets found in that workbook')
      return
    }
    setData({
      breeding: [...data.breeding, ...next.breeding],
      individual: [...data.individual, ...next.individual],
      work: [...data.work, ...next.work],
      litters: data.litters,
      protocols: data.protocols,
    })
    flash(`Imported ${next.breeding.length} breeding and ${next.individual.length} individual cages`)
  }

  const saveLitter = (litter: LitterRecord) => {
    const dates = litterDates(litter.dob)
    const updatedBreeding = data.breeding.map((cage) => cage.id === litter.breedingCageId
      ? { ...cage, pupsDob: litter.dob, pupsCount: litter.pupCount, genotypeNeeded: litter.genotypeRequired }
      : cage)
    const entry: WorkEntry = {
      id: `work-${Date.now()}`,
      line: litter.line,
      cage: litter.breedingCageLabel,
      date: format(new Date(), 'yyyy-MM-dd'),
      type: 'Pups born',
      description: `New litter ${litter.reference}, DOB ${litter.dob}, count ${litter.pupCount}.`,
      followUpDate: dates.weanDate,
    }
    setData({
      ...data,
      breeding: updatedBreeding,
      litters: [litter, ...data.litters],
      work: [entry, ...data.work],
    })
    setShowLitter(false)
    setActiveLine(litter.line)
    setView('litters')
    if (litterMode === 'genotype') {
      setLitterMode('genotype')
      setSelectedLitterId(litter.id)
    } else {
      setLitterMode('all')
      setSelectedLitterId(null)
    }
    flash(`Litter saved. Wean due ${format(parseISO(dates.weanDate), 'MMM d')}`)
  }

  const updateLitter = (litter: LitterRecord) => {
    setData({
      ...data,
      breeding: data.breeding.map((cage) => cage.id === litter.breedingCageId
        ? { ...cage, pupsDob: litter.dob, pupsCount: litter.pupCount, genotypeNeeded: litter.genotypeRequired }
        : cage),
      litters: data.litters.map((item) => item.id === litter.id ? litter : item),
    })
    flash('Genotype saved')
  }

  const confirmWeanTransfer = (groups: WeanGroupDraft[]) => {
    if (!selectedLitter) return
    const transferDate = format(new Date(), 'yyyy-MM-dd')
    const transferred = transferLitter(data, selectedLitter.id, groups, transferDate)
    const entry: WorkEntry = {
      id: `work-${Date.now()}`,
      line: selectedLitter.line,
      cage: selectedLitter.breedingCageLabel,
      date: transferDate,
      type: 'Wean transfer',
      description: `Transferred ${groups.reduce((sum, group) => sum + group.pupIds.length, 0)} pups from ${selectedLitter.reference} into individual cages.`,
    }
    setData({
      ...transferred,
      work: [entry, ...transferred.work],
    })
    flash('Wean transfer complete')
  }

  const addBreedingCage = (cage: BreedingCage) => {
    const entry: WorkEntry = {
      id: `work-${Date.now()}`,
      line: cage.line,
      cage: cage.cage,
      date: todayIso,
      type: 'Manual cage added',
      description: `Added breeding cage ${cage.cage}: ${cage.pairing}.`,
    }
    setData({
      ...data,
      breeding: [...data.breeding, cage],
      work: [entry, ...data.work],
    })
    setManualCageForm(null)
    flash(`Breeding cage ${cage.cage} added`)
  }

  const updateBreedingCage = (cage: BreedingCage) => {
    const entry: WorkEntry = {
      id: `work-${Date.now()}`,
      line: cage.line,
      cage: cage.cage,
      date: todayIso,
      type: 'Manual cage edited',
      description: `Edited breeding cage ${cage.cage}.`,
    }
    setData({
      ...data,
      breeding: data.breeding.map((item) => item.id === cage.id ? cage : item),
      work: [entry, ...data.work],
    })
    setEditingBreedingCage(null)
    flash(`Breeding cage ${cage.cage} updated`)
  }

  const deleteBreedingCage = (cageId: string) => {
    const cage = data.breeding.find((item) => item.id === cageId)
    if (!cage) return
    const entry: WorkEntry = {
      id: `work-${Date.now()}`,
      line: cage.line,
      cage: cage.cage,
      date: todayIso,
      type: 'Manual cage removed',
      description: `Removed breeding cage ${cage.cage}.`,
    }
    setData({
      ...data,
      breeding: data.breeding.filter((item) => item.id !== cageId),
      work: [entry, ...data.work],
    })
    flash(`Breeding cage ${cage.cage} removed`)
  }

  const addIndividualCage = (cage: IndividualCage) => {
    const shouldAutoNumber = !cage.cage.trim() || cage.cage === 'Auto'
    const nextCage = shouldAutoNumber
      ? { ...cage, cage: String(data.individual.filter((item) => item.line === cage.line).length + 1) }
      : cage
    const entry: WorkEntry = {
      id: `work-${Date.now()}`,
      line: nextCage.line,
      cage: nextCage.cage,
      date: todayIso,
      type: 'Manual cage added',
      description: `Added individual cage ${nextCage.cage} with ${nextCage.count} mice.`,
    }
    setData({
      ...data,
      individual: sortIndividualCages([...data.individual, nextCage]),
      work: [entry, ...data.work],
    })
    setManualCageForm(null)
    flash(`Individual cage ${nextCage.cage} added`)
  }

  const updateIndividualCage = (cage: IndividualCage) => {
    const entry: WorkEntry = {
      id: `work-${Date.now()}`,
      line: cage.line,
      cage: cage.cage,
      date: todayIso,
      type: 'Manual cage edited',
      description: `Edited individual cage ${cage.cage}.`,
    }
    setData({
      ...data,
      individual: sortIndividualCages(data.individual.map((item) => item.id === cage.id ? cage : item)),
      work: [entry, ...data.work],
    })
    setEditingIndividualCage(null)
    flash(`Individual cage ${cage.cage} updated`)
  }

  const deleteIndividualCage = (cageId: string) => {
    const cage = data.individual.find((item) => item.id === cageId)
    if (!cage) return
    const entry: WorkEntry = {
      id: `work-${Date.now()}`,
      line: cage.line,
      cage: cage.cage,
      date: todayIso,
      type: 'Manual cage removed',
      description: `Removed individual cage ${cage.cage} with ${cage.count} mice.`,
    }
    setData({
      ...data,
      individual: renumberIndividualCages(data.individual.filter((item) => item.id !== cageId), cage.line),
      work: [entry, ...data.work],
    })
    flash(`Individual cage ${cage.cage} removed`)
  }

  const renumberVisibleIndividualCages = () => {
    const targetLine = activeLine === 'All lines' ? undefined : activeLine
    const entry: WorkEntry = {
      id: `work-renumber-individual-${Date.now()}`,
      line: activeLine,
      cage: targetLine ?? 'All individual cages',
      date: todayIso,
      type: 'Individual cages renumbered',
      description: targetLine
        ? `Auto-sorted individual cage numbers for ${targetLine}.`
        : 'Auto-sorted individual cage numbers for all lines.',
    }
    setData({
      ...data,
      individual: renumberIndividualCages(data.individual, targetLine),
      work: [entry, ...data.work],
    })
    flash(targetLine ? `${targetLine} individual cages renumbered` : 'All individual cages renumbered')
  }

  const saveEuthanasiaRecord = async (record: {
    cageId: string
    date: string
    count: number
    reason: string
    notes: string
    cardFile: File | null
  }) => {
    const cage = data.individual.find((item) => item.id === record.cageId)
    if (!cage) return
    const removedCount = Math.max(1, Math.min(record.count, cage.count))
    const remainingCount = cage.count - removedCount
    const metadata = record.cardFile ? await saveAttachment(record.cardFile, 'euthanasia-evidence') : undefined
    const description = [
      `Euthanized ${removedCount} ${removedCount > 1 ? 'mice' : 'mouse'} from individual cage ${cage.cage}.`,
      `Reason: ${record.reason}.`,
      record.notes ? `Notes: ${record.notes}.` : '',
      metadata ? `Card: ${metadata.originalName}.` : '',
      remainingCount > 0 ? `${remainingCount} remaining in cage.` : 'Cage removed because no mice remain.',
    ].filter(Boolean).join(' ')
    const entry: WorkEntry = {
      id: `work-euthanasia-${Date.now()}`,
      line: cage.line,
      cage: cage.cage,
      date: record.date,
      type: 'Euthanasia',
      description,
      attachmentIds: metadata ? [metadata.id] : [],
      attachments: metadata ? [metadata] : [],
    }
    setData({
      ...data,
      individual: remainingCount > 0
        ? sortIndividualCages(data.individual.map((item) => item.id === cage.id ? { ...item, count: remainingCount } : item))
        : renumberIndividualCages(data.individual.filter((item) => item.id !== cage.id), cage.line),
      work: [entry, ...data.work],
    })
    setShowEuthanasia(false)
    setView('work')
    flash('Euthanasia record saved')
  }

  const saveProtocol = async (protocol: GenotypeProtocol, files: File[]) => {
    const newAttachments = await Promise.all(files.map((file) => saveAttachment(file, 'genotype-protocol')))
    const nextProtocol: GenotypeProtocol = {
      ...protocol,
      attachmentIds: [...(protocol.attachmentIds ?? []), ...newAttachments.map((attachment) => attachment.id)],
      attachments: [...(protocol.attachments ?? []), ...newAttachments],
      updatedAt: new Date().toISOString(),
    }
    const exists = data.protocols.some((item) => item.id === nextProtocol.id)
    const entry: WorkEntry = {
      id: `work-protocol-${Date.now()}`,
      line: nextProtocol.line,
      cage: 'Protocol',
      date: todayIso,
      type: exists ? 'Genotype protocol edited' : 'Genotype protocol added',
      description: `${exists ? 'Updated' : 'Added'} genotype protocol ${nextProtocol.name}${nextProtocol.targetGene ? ` for ${nextProtocol.targetGene}` : ''}.`,
      attachmentIds: newAttachments.map((attachment) => attachment.id),
      attachments: newAttachments,
    }
    setData({
      ...data,
      protocols: exists
        ? data.protocols.map((item) => item.id === nextProtocol.id ? nextProtocol : item)
        : [nextProtocol, ...data.protocols],
      work: [entry, ...data.work],
    })
    setShowProtocol(false)
    setEditingProtocol(null)
    setView('protocols')
    setActiveLine(nextProtocol.line)
    flash(`Protocol ${nextProtocol.name} saved`)
  }

  const deleteProtocol = (protocolId: string) => {
    const protocol = data.protocols.find((item) => item.id === protocolId)
    if (!protocol) return
    const entry: WorkEntry = {
      id: `work-protocol-delete-${Date.now()}`,
      line: protocol.line,
      cage: 'Protocol',
      date: todayIso,
      type: 'Genotype protocol removed',
      description: `Removed genotype protocol ${protocol.name}.`,
    }
    setData({
      ...data,
      protocols: data.protocols.filter((item) => item.id !== protocolId),
      work: [entry, ...data.work],
    })
    flash(`Protocol ${protocol.name} removed`)
  }

  if (!canUseWorkspace || passwordRecoveryRequested) {
    return <AccessGate state={authState} onChange={setAuth} onLogOut={logOut} initialMode={passwordRecoveryRequested ? 'reset' : 'signin'} />
  }

  return (
    <div className="app-shell">
      <aside className={sidebarOpen ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <div className="brand-mark"><FlaskConical size={20} /></div>
          <div><strong>TU Lab Colony</strong><span>Private workspace</span></div>
          <button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X size={19} /></button>
        </div>
        <nav>
          {views.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} className={view === item.id ? 'nav-item active' : 'nav-item'} onClick={() => {
                setView(item.id)
                if (item.id === 'litters') {
                  setLitterMode('all')
                  setSelectedLitterId(null)
                }
                setSidebarOpen(false)
              }}>
                <Icon size={18} />{item.label}
              </button>
            )
          })}
        </nav>
        <div className="sidebar-section">
          <span className="sidebar-label">COLONY LINES</span>
          {lines.slice(1).map((line) => (
            <div className="line-nav-row" key={line}>
              <button className={activeLine === line ? 'line-link active' : 'line-link'} onClick={() => setActiveLine(line)}>
                <span className="line-dot" />{line}
              </button>
              <button className="line-manage-button" onClick={() => openLineManager(line)} aria-label={`Manage ${line}`} title={`Manage ${line}`}>
                <Settings2 size={14} />
              </button>
            </div>
          ))}
        </div>
        {archivedLines.length > 0 && (
          <div className="sidebar-section archived-lines-section">
            <span className="sidebar-label">ARCHIVED</span>
            {archivedLines.map((line) => (
              <div className="archived-line-row" key={line}>
                <span><Archive size={13} />{line}</span>
                <div>
                  <button onClick={() => restoreLine(line)} aria-label={`Restore ${line}`} title={`Restore ${line}`}><RotateCcw size={13} /></button>
                  <button onClick={() => openLineManager(line)} aria-label={`Manage archived ${line}`} title={`Manage archived ${line}`}><Settings2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
        {importProfile.sidebarFilters.length > 0 && (
          <div className="sidebar-section">
            <span className="sidebar-label">IMPORTED FIELDS</span>
            {importProfile.sidebarFilters.map((field) => (
              <button className="line-link" key={field} onClick={() => setQuery(field)}>
                <span className="line-dot custom-dot" />{field}
              </button>
            ))}
          </div>
        )}
        <div className="sidebar-footer">
          <div className="storage-note">TU Lab private data<br /><span>Approved members only</span></div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cage, DOB, genotype, mouse number…" />
            <kbd>⌘ K</kbd>
          </div>
          <button className="icon-button mobile-report-button" onClick={openGenotypeReport} aria-label="Open genotype report" title="Open genotype report"><Network size={20} /></button>
          <div className="top-actions">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(event) => handleImport(event.target.files?.[0])} />
            <button className="button secondary" onClick={() => fileRef.current?.click()}><FileSpreadsheet size={17} />Import Excel</button>
            <button className="button secondary report-button" onClick={openGenotypeReport}><Network size={17} />Genotype report</button>
            <button className="button secondary calendar-button" onClick={() => downloadIcs(data.breeding, data.litters)}><Download size={17} />Calendar</button>
            <button className="button secondary" onClick={logOut}>Log out</button>
            <button className="button primary" onClick={() => setShowLitter(true)}><CirclePlus size={17} />New litter</button>
          </div>
        </header>

        <section className="page">
          <div className="page-heading">
            <div>
              <span className="eyebrow">{activeLine === 'All lines' ? 'ALL COLONIES' : activeLine}</span>
              <h1>{views.find((item) => item.id === view)?.label}</h1>
              <p>{view === 'dashboard' ? 'Today’s colony status, priorities, and work that needs attention.' : 'Fast, searchable records built around the way the mouse room actually works.'}</p>
            </div>
            <label className="line-select">Line
              <select value={activeLine} onChange={(event) => setActiveLine(event.target.value)}>
                {lines.map((line) => <option key={line}>{line}</option>)}
              </select>
              <ChevronDown size={15} />
            </label>
          </div>

          {view === 'dashboard' && (
            <>
              <div className="metrics">
                <Metric label="Breeding cages" value={lineBreeding.length} detail={`${lineBreeding.filter((x) => x.priority).length} priority`} />
                <Metric label="Individual cages" value={lineIndividual.length} detail={`${mouseCount} mice recorded`} />
                <Metric label="Due next 7 days" value={due.length} detail="Wean reminders" tone={due.length ? 'warning' : undefined} />
                <Metric label="Genotype due" value={genotypeDue} detail="Litter workspaces" tone={genotypeDue ? 'warning' : undefined} />
                <Metric label="Low genotype" value={genotypeInventoryAlerts.length} detail="WT/KO below 3" tone={genotypeInventoryAlerts.length ? 'danger' : undefined} />
                <Metric label="Awaiting sex" value={awaitingSex} detail="Blocked from transfer" tone={awaitingSex ? 'danger' : undefined} />
                <Metric label="Older breeders" value={oldBreeders} detail="Over 12 months" tone={oldBreeders ? 'danger' : undefined} />
                <Metric label="Mixed cages" value={mixedCount} detail="Mouse-level map available" />
              </div>

              <div className="dashboard-grid">
                <section className="panel attention-panel">
                  <div className="panel-header"><div><h2>Action queue</h2><span>Sorted by urgency</span></div><CalendarDays size={19} /></div>
                  <div className="action-list">
                    {lineBreeding
                      .filter((cage) => cage.priority || isDueSoon(cage))
                      .sort((a, b) => Number(isDueSoon(b)) - Number(isDueSoon(a)))
                      .slice(0, 8)
                      .map((cage) => {
                        const status = weanStatus(cage)
                        return (
                          <button className="action-row" key={cage.id} onClick={() => { setActiveLine(cage.line); setView('breeding') }}>
                            <span className={`status-dot ${status.tone}`} />
                            <div><strong>{cage.line} · Cage {cage.cage}</strong><span>{cage.pupsDob ? `Pups ${fmt(cage.pupsDob)} · ${status.label}` : cage.notes || 'Priority breeding cage'}</span></div>
                            <span className={`badge ${status.tone}`}>{status.label}</span>
                          </button>
                        )
                      })}
                  </div>
                </section>

                <section className="panel" aria-label="Genotype schedule">
                  <div className="panel-header"><div><h2>Genotype schedule</h2><span>P4-P11 windows before wean</span></div><FlaskConical size={19} /></div>
                  <div className="action-list">
                    {genotypeSchedule.length ? genotypeSchedule.map((litter) => {
                      const dates = litterDates(litter.dob)
                      const status = getLitterStatus(litter, todayIso)
                      const windowTone = todayIso > dates.genotypeEnd ? 'urgent' : todayIso >= dates.genotypeStart ? 'warning' : 'scheduled'
                      const windowLabel = todayIso > dates.genotypeEnd ? 'Past window' : todayIso >= dates.genotypeStart ? 'Do genotype' : `Starts ${format(parseISO(dates.genotypeStart), 'MMM d')}`
                      return (
                        <button className="action-row" key={litter.id} onClick={() => { setActiveLine(litter.line); setView('litters'); setLitterMode('genotype'); setSelectedLitterId(litter.id) }}>
                          <span className={`status-dot ${windowTone}`} />
                          <div>
                            <strong>{litter.line} · Litter {litter.reference}</strong>
                            <span>DOB {fmt(litter.dob)} · P4-P11 {format(parseISO(dates.genotypeStart), 'MMM d')}-{format(parseISO(dates.genotypeEnd), 'MMM d')} · P21 {format(parseISO(dates.weanDate), 'MMM d')}</span>
                          </div>
                          <span className={`badge ${windowTone}`}>{status === 'genotype_in_progress' ? 'In progress' : windowLabel}</span>
                        </button>
                      )
                    }) : (
                      <div className="empty-inline">No genotype windows needing attention.</div>
                    )}
                  </div>
                </section>

                <section className="panel" aria-label="Colony overview">
                  <div className="panel-header"><div><h2>Colony overview</h2><span>Breeding and individual cages by line</span></div><Activity size={19} /></div>
                  <div className="line-summary">
                    {dashboardLines.map((line) => {
                      const breedingCount = data.breeding.filter((cage) => cage.line === line).length
                      const individualCount = data.individual.filter((cage) => cage.line === line).length
                      return (
                        <button className={activeLine === line ? 'selected' : ''} key={line} onClick={() => setActiveLine(line)}>
                          <span className="line-name">{line}</span>
                          <div className="line-bars">
                            <div className="line-bar-row">
                              <span>Breeding {breedingCount}</span>
                              <div className="bar breeding-bar"><i style={{ width: `${Math.max(6, (breedingCount / lineInventoryMax) * 100)}%` }} /></div>
                            </div>
                            <div className="line-bar-row">
                              <span>Individual {individualCount}</span>
                              <div className="bar individual-bar"><i style={{ width: `${Math.max(6, (individualCount / lineInventoryMax) * 100)}%` }} /></div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>

                <section className="panel genotype-inventory-panel" aria-label="Genotype inventory alerts">
                  <div className="panel-header"><div><h2>Genotype inventory alerts</h2><span>WT/KO groups with fewer than 3 mice</span></div><AlertTriangle size={19} /></div>
                  <div className="inventory-alert-list">
                    {genotypeInventoryAlerts.length ? genotypeInventoryAlerts.map((alert) => (
                      <button className="inventory-alert-row" key={`${alert.line}-${alert.genotype}`} onClick={() => openGenotypeInventoryAlert(alert)}>
                        <span className={`status-dot ${alert.tone}`} />
                        <div>
                          <strong>{alert.line} · {alert.genotype}</strong>
                          <span>{alert.count === 0 ? 'No mice recorded' : `${alert.count} mice recorded`} · target at least 3</span>
                        </div>
                        <span className={`badge ${alert.tone}`}>{alert.count === 0 ? 'Missing' : 'Low'}</span>
                      </button>
                    )) : (
                      <div className="empty-inline">All WT/KO groups have at least 3 mice.</div>
                    )}
                  </div>
                </section>

                <section className="panel age-availability-panel" aria-label="Individual age availability">
                  <div className="panel-header">
                    <div><h2>Individual age availability</h2><span>{activeLine === 'All lines' ? 'All lines' : activeLine} · sex and age buckets</span></div>
                    <MousePointer2 size={19} />
                  </div>
                  <div className="availability-grid">
                    {ageAvailability.map((bucket) => {
                      const maxGenotypeCount = Math.max(1, ...Object.values(bucket.genotypeCounts))
                      return (
                        <div className={`availability-card ${bucket.id}`} key={bucket.id}>
                          <button
                            type="button"
                            className="availability-title dashboard-drilldown"
                            onClick={() => openIndividualDashboardFilter({ bucketId: bucket.id, bucketLabel: bucket.label })}
                            aria-label={`Show individual cages in ${bucket.label}`}
                          >
                            <span><strong>{bucket.label}</strong><small>{bucket.detail}</small></span>
                            <b>{bucket.total}</b>
                          </button>
                          <div className="genotype-sex-matrix">
                            {genotypeDisplayOrder
                              .filter((genotype) => genotype !== 'Mixed')
                              .filter((genotype) => bucket.genotypeCounts[genotype] > 0)
                              .map((genotype) => {
                                const counts = bucket.genotypeSexCounts[genotype]
                                const total = bucket.genotypeCounts[genotype]
                                return (
                                  <div className={`genotype-sex-row ${genotype.toLowerCase().replace(/\s+/g, '-')}`} key={genotype}>
                                    <button
                                      type="button"
                                      className="genotype-row-head dashboard-drilldown"
                                      onClick={() => openIndividualDashboardFilter({ bucketId: bucket.id, bucketLabel: bucket.label, genotype })}
                                      aria-label={`Show ${bucket.label} ${genotype} individual cages`}
                                    >
                                      <strong>{genotype}</strong>
                                      <span>{total}</span>
                                    </button>
                                    <div className="genotype-row-bar"><i style={{ width: `${Math.max(8, (total / maxGenotypeCount) * 100)}%` }} /></div>
                                    <div className="sex-pair-grid">
                                      {(['Male', 'Female'] as const).map((sex) => (
                                        <button
                                          type="button"
                                          className={`sex-count ${sex.toLowerCase()} dashboard-drilldown`}
                                          key={sex}
                                          onClick={() => openIndividualDashboardFilter({ bucketId: bucket.id, bucketLabel: bucket.label, genotype, sex })}
                                          aria-label={`Show ${bucket.label} ${genotype} ${sex} individual cages`}
                                        >
                                          <small>{genotype} {sex}</small>
                                          <b>{counts[sex]}</b>
                                        </button>
                                      ))}
                                      {(counts.Mixed > 0 || counts.Unknown > 0) && (
                                        <span className="sex-count mixed">
                                          <small>Mixed/Unknown</small>
                                          <b>{counts.Mixed + counts.Unknown}</b>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            {bucket.total === 0 && <span className="empty-bucket">No mice in this window</span>}
                          </div>
                          {bucket.total > 0 && (
                            <div className="bucket-sex-total">
                              {Object.entries(bucket.sexCounts)
                                .filter(([, count]) => count > 0)
                                .map(([sex, count]) => (
                                  <span key={sex}>{sex} {count}</span>
                                ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>

                {importProfile.fields.length > 0 && (
                  <section className="panel custom-insights-panel" aria-label="Personalized import insights">
                    <div className="panel-header">
                      <div><h2>Personalized import insights</h2><span>Imported fields</span></div>
                      <FileSpreadsheet size={19} />
                    </div>
                    <div className="custom-insights-grid">
                      {importProfile.fields.slice(0, 4).map((field) => {
                        const maxValue = Math.max(1, ...field.values.map((value) => value.count))
                        return (
                          <div className="custom-field-card" key={field.name}>
                            <div className="custom-field-title">
                              <strong>{field.name}</strong>
                              <span>{field.total} mice/cages</span>
                            </div>
                            <div className="custom-value-list">
                              {field.values.map((value) => (
                                <div className="custom-value-row" key={value.label}>
                                  <span>{value.label}</span>
                                  <div className="custom-value-bar"><i style={{ width: `${Math.max(8, (value.count / maxValue) * 100)}%` }} /></div>
                                  <b>{value.count}</b>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                <section className="panel recent-panel">
                  <div className="panel-header"><div><h2>Recent work</h2><span>Visible record of daily labor</span></div><ClipboardList size={19} /></div>
                  <div className="timeline">
                    {lineWork.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7).map((entry) => (
                      <div className="timeline-row" key={entry.id}>
                        <span className="timeline-date">{format(parseISO(entry.date), 'MMM d')}</span>
                        <div><strong>{entry.type}</strong><span>{entry.line} cage {entry.cage} · {entry.description}</span></div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-header"><div><h2>Quick actions</h2><span>Common mouse-room workflows</span></div><CirclePlus size={19} /></div>
                  <div className="quick-actions">
                    <button onClick={() => setShowLitter(true)}><CirclePlus /><span><strong>Record new litter</strong><small>Auto-calculate P21 and genotype window</small></span></button>
                    <button onClick={openGenotypeWork}><FlaskConical /><span><strong>Record genotype</strong><small>Open litter workspace with Gel image upload</small></span></button>
                    <button onClick={() => setShowProtocol(true)}><BookOpenText /><span><strong>Genotype protocol</strong><small>Primer, PCR program, expected bands, and SOP files</small></span></button>
                    <button onClick={() => setShowEuthanasia(true)}><Trash2 /><span><strong>Euthanasia record</strong><small>Upload card and reduce individual cage count</small></span></button>
                    <button onClick={() => downloadIcs(data.breeding, data.litters)}><CalendarDays /><span><strong>Download reminders</strong><small>Import .ics into Outlook</small></span></button>
                  </div>
                </section>
              </div>
            </>
          )}

          {view === 'breeding' && <BreedingTable rows={breeding} onAdd={() => setManualCageForm('breeding')} onEdit={setEditingBreedingCage} onDelete={deleteBreedingCage} />}
          {view === 'litters' && selectedLitter && (
            <LitterWorkspace litter={selectedLitter} onBack={() => setSelectedLitterId(null)} onSave={updateLitter} onTransfer={confirmWeanTransfer} />
          )}
          {view === 'litters' && !selectedLitter && (
            <LitterList rows={visibleLitters} onOpen={(litterId) => setSelectedLitterId(litterId)} mode={litterMode} onNewLitter={() => setShowLitter(true)} />
          )}
          {view === 'individual' && (
            <IndividualTable
              rows={individual}
              dashboardFilter={individualDashboardFilter}
              onClearDashboardFilter={() => setIndividualDashboardFilter(null)}
              onAdd={() => setManualCageForm('individual')}
              onEdit={setEditingIndividualCage}
              onDelete={deleteIndividualCage}
              onRenumber={renumberVisibleIndividualCages}
            />
          )}
          {view === 'protocols' && <ProtocolLibrary rows={protocols} onAdd={() => setShowProtocol(true)} onEdit={setEditingProtocol} onDelete={deleteProtocol} />}
          {view === 'work' && <WorkTable rows={work} />}
          {view === 'account' && (
            <AccountBillingPage
              workspace={workspace}
              testUser={testUser}
              testUserName={testUserName}
              testUserEmail={testUserEmail}
              workspaceQuery={workspaceQuery}
              onTestUserName={setTestUserName}
              onTestUserEmail={setTestUserEmail}
              onWorkspaceQuery={setWorkspaceQuery}
              onRegister={registerTestUser}
              onRequestAccess={requestWorkspaceAccess}
              onApprove={approveViewerAccess}
              onRemoveMember={removeViewerAccess}
              productionConnections={productionConnections}
            />
          )}
        </section>
      </main>

      {showLitter && <NewLitterDialog lines={lines.slice(1)} cages={data.breeding} onClose={() => setShowLitter(false)} onSave={saveLitter} />}
      {showGenotypeReport && (
        <Suspense fallback={<div className="genotype-report-backdrop"><div className="genotype-report-loading" role="status">Preparing charts...</div></div>}>
          <GenotypeReportView
            report={genotypeReport}
            onClose={() => setShowGenotypeReport(false)}
            onRefresh={() => setReportGeneratedAt(new Date())}
            onCopy={() => { void copyGenotypeReport() }}
            onPrint={() => window.print()}
          />
        </Suspense>
      )}
      {showProtocol && <ProtocolDialog lines={lines.slice(1)} defaultLine={activeLine === 'All lines' ? lines[1] : activeLine} onClose={() => setShowProtocol(false)} onSave={saveProtocol} />}
      {editingProtocol && <ProtocolDialog lines={lines.slice(1)} defaultLine={editingProtocol.line} initialProtocol={editingProtocol} onClose={() => setEditingProtocol(null)} onSave={saveProtocol} />}
      {showEuthanasia && <EuthanasiaDialog lines={lines.slice(1)} cages={data.individual} defaultLine={activeLine === 'All lines' ? lines[1] : activeLine} onClose={() => setShowEuthanasia(false)} onSave={saveEuthanasiaRecord} />}
      {manualCageForm === 'breeding' && (
        <BreedingCageDialog
          lines={lines.slice(1)}
          defaultLine={activeLine === 'All lines' ? lines[1] : activeLine}
          onClose={() => setManualCageForm(null)}
          onSave={addBreedingCage}
        />
      )}
      {editingBreedingCage && (
        <BreedingCageDialog
          lines={lines.slice(1)}
          defaultLine={editingBreedingCage.line}
          initialCage={editingBreedingCage}
          onClose={() => setEditingBreedingCage(null)}
          onSave={updateBreedingCage}
        />
      )}
      {manualCageForm === 'individual' && (
        <IndividualCageDialog
          lines={lines.slice(1)}
          defaultLine={activeLine === 'All lines' ? lines[1] : activeLine}
          onClose={() => setManualCageForm(null)}
          onSave={addIndividualCage}
        />
      )}
      {editingIndividualCage && (
        <IndividualCageDialog
          lines={lines.slice(1)}
          defaultLine={editingIndividualCage.line}
          initialCage={editingIndividualCage}
          onClose={() => setEditingIndividualCage(null)}
          onSave={updateIndividualCage}
        />
      )}
      {managedLine && (
        <ColonyLineDialog
          key={managedLine}
          line={managedLine}
          summary={getColonyLineSummary(data, managedLine)}
          archived={archivedLines.includes(managedLine)}
          mode={lineDialogMode}
          onModeChange={setLineDialogMode}
          onArchive={() => archiveLine(managedLine)}
          onRestore={() => {
            restoreLine(managedLine)
            setManagedLine(null)
          }}
          onDelete={() => permanentlyDeleteLine(managedLine)}
          onClose={() => setManagedLine(null)}
        />
      )}
      {sessionExpired && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-label="Cloud session expired">
            <div className="modal-header">
              <div><h2>Cloud session expired</h2><span>Your colony data on this device will be kept.</span></div>
              <Cloud size={20} />
            </div>
            <p className="management-copy">Sign in again to reconnect this device and load the latest colony records.</p>
            <div className="modal-actions">
              <button type="button" className="button primary" onClick={restartExpiredSession}>Sign in again</button>
            </div>
          </section>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function ColonyLineDialog({ line, summary, archived, mode, onModeChange, onArchive, onRestore, onDelete, onClose }: {
  line: string
  summary: ReturnType<typeof getColonyLineSummary>
  archived: boolean
  mode: 'manage' | 'delete'
  onModeChange: (mode: 'manage' | 'delete') => void
  onArchive: () => void
  onRestore: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const [confirmation, setConfirmation] = useState('')
  const linkedRecordCount = summary.breeding + summary.individual + summary.work + summary.litters + summary.protocols

  if (mode === 'delete') {
    return (
      <div className="modal-backdrop">
        <section className="modal colony-line-modal" role="dialog" aria-modal="true" aria-label={`Delete ${line} colony`}>
          <div className="modal-header">
            <div><h2>Delete {line} permanently?</h2><span>This cannot be undone.</span></div>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X /></button>
          </div>
          <p className="destructive-copy">This removes {linkedRecordCount} linked records, including cages, litters, work history, and genotype protocols. Archive the colony instead if you need its history later.</p>
          <label>Type {line} to confirm<input aria-label={`Type ${line} to confirm`} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={() => onModeChange('manage')}>Back</button>
            <button type="button" className="button danger" disabled={confirmation !== line} onClick={onDelete}>Delete {line} permanently</button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="modal-backdrop">
      <section className="modal colony-line-modal" role="dialog" aria-modal="true" aria-label={`Manage ${line} colony`}>
        <div className="modal-header">
          <div><h2>{line}</h2><span>{linkedRecordCount} linked records</span></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="colony-line-counts">
          <span><strong>{summary.breeding}</strong> breeding cages</span>
          <span><strong>{summary.individual}</strong> individual cages</span>
          <span><strong>{summary.litters}</strong> litters</span>
          <span><strong>{summary.protocols}</strong> protocols</span>
          <span><strong>{summary.work}</strong> work entries</span>
        </div>
        <p className="management-copy">Archiving hides this colony from daily views while keeping all records. Permanent deletion removes every linked record.</p>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          {archived
            ? <button type="button" className="button secondary" onClick={onRestore}><RotateCcw size={15} />Restore colony</button>
            : <button type="button" className="button secondary" onClick={onArchive}><Archive size={15} />Archive colony</button>}
          <button type="button" className="button danger" onClick={() => onModeChange('delete')}><Trash2 size={15} />Delete colony</button>
        </div>
      </section>
    </div>
  )
}

type AuthMode = 'signin' | 'register' | 'forgot' | 'reset'

function AccessGate({ state, onChange, onLogOut, initialMode = 'signin' }: {
  state: AuthSessionState
  onChange: (state: AuthSessionState) => void
  onLogOut: () => Promise<void>
  initialMode?: AuthMode
}) {
  const [name, setName] = useState(state.user?.name ?? '')
  const [email, setEmail] = useState(state.user?.email ?? '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [authMode, setAuthMode] = useState<AuthMode>(initialMode)
  const [productionLabMatches, setProductionLabMatches] = useState<ProductionLab[]>([])
  const [isBusy, setIsBusy] = useState(false)
  const [accessError, setAccessError] = useState('')
  const [accessNotice, setAccessNotice] = useState('')
  const productionConfig = getProductionConfig()
  const productionReady = productionConfig.supabaseReady
  const effectiveAuthMode: AuthMode = productionReady ? authMode : 'register'
  const visibleLabMatches = productionReady ? productionLabMatches : [tuLabDirectoryEntry]
  const tuLab = visibleLabMatches[0]
  const showRegister = state.status === 'visitor' || state.status === 'tour' || effectiveAuthMode === 'reset'
  useEffect(() => {
    if (!productionReady || state.status !== 'lab_search') return
    let alive = true
    searchProductionLabs('Yaping Tu Lab')
      .then((labs) => {
        if (alive) setProductionLabMatches(labs)
      })
      .catch((error: Error) => {
        if (alive) setAccessError(error.message)
      })
    return () => { alive = false }
  }, [productionReady, state.status])

  async function finishProductionSignIn(nextState: AuthSessionState) {
    const memberships = await loadCurrentLabMemberships()
    const approved = memberships[0]
    if (approved) {
      onChange({
        ...nextState,
        status: 'workspace_approved',
        selectedWorkspaceId: approved.lab.id,
        pendingWorkspaceName: approved.lab.name,
      })
      return
    }
    onChange(markEmailVerified(nextState))
  }

  async function checkApprovalAndEnter() {
    setAccessError('')
    if (!productionReady) return
    setIsBusy(true)
    try {
      const memberships = await loadCurrentLabMemberships()
      const approved = memberships[0]
      if (!approved) {
        setAccessError('No approved TU Lab access yet. Please ask an owner/admin to approve this account, then try again.')
        return
      }
      onChange({
        ...state,
        status: 'workspace_approved',
        selectedWorkspaceId: approved.lab.id,
        pendingWorkspaceName: approved.lab.name,
      })
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : 'Could not check approval yet. Please sign in again.')
    } finally {
      setIsBusy(false)
    }
  }

  async function submitAccount(event: FormEvent) {
    event.preventDefault()
    setAccessError('')
    setAccessNotice('')

    if (!productionReady) {
      onChange(registerAuthUser(state, name, email))
      return
    }

    setIsBusy(true)
    try {
      if (effectiveAuthMode === 'forgot') {
        const { error } = await resetPasswordForEmail(email.trim())
        if (error) throw error
        setAccessNotice('Check your email for a password reset link.')
        return
      }

      if (effectiveAuthMode === 'reset') {
        if (password !== confirmPassword) {
          setAccessError('Passwords do not match.')
          return
        }
        const { error } = await updatePassword(password)
        if (error) throw error
        await productionSignOut().catch(() => undefined)
        window.history.replaceState({}, '', '/')
        onChange(createInitialAuthState())
        setPassword('')
        setConfirmPassword('')
        setAuthMode('signin')
        setAccessNotice('Password updated. Sign in with your new password.')
        return
      }

      if (effectiveAuthMode === 'signin') {
        const { error } = await signInWithEmail(email.trim(), password)
        if (error) throw error
        await finishProductionSignIn(registerAuthUser(state, name || email, email))
        return
      }

      const { error } = await signUpWithEmail(email.trim(), password, name.trim())
      if (error) throw error
      onChange(registerAuthUser(state, name, email))
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : 'Sign-in failed. Please try again.')
    } finally {
      setIsBusy(false)
    }
  }

  async function submitLabAccess(lab: LabDirectoryEntry | ProductionLab) {
    setAccessError('')
    if (!productionReady) {
      onChange(createLabAccessRequest(state, lab.id))
      return
    }

    setIsBusy(true)
    try {
      const { error } = await requestProductionLabAccess({ labId: lab.id, requestedRole: 'viewer' })
      if (error) throw error
      onChange({
        ...state,
        status: 'lab_access_pending',
        selectedWorkspaceId: lab.id,
        pendingWorkspaceName: lab.name,
      })
    } catch (error) {
      setAccessError(getErrorMessage(error, 'Request failed. Please try again.'))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className="access-shell">
      <section className="access-hero">
        <div className="access-grid-lines" aria-hidden="true" />
        <div className="access-glow" aria-hidden="true" />
        <div className="access-nav">
          <span className="access-logo"><FlaskConical size={20} />TU Lab Colony</span>
          <div className="access-nav-actions">
            <span>{state.user?.email ? state.user.email : 'Private mouse colony workspace · approved access only'}</span>
            {state.user && <button className="access-text-button" onClick={onLogOut}>Log out</button>}
          </div>
        </div>
        <div className="access-hero-grid">
          <div className="access-copy">
            <span className="eyebrow">YAPING TU LAB</span>
            <h1>TU Lab mouse colony manager</h1>
            <p>Private workspace for approved TU Lab members. Colony records, genotype evidence, photos, and cage updates stay behind login and manager approval.</p>
          </div>
          <aside className="access-status-card" aria-label="TU Lab privacy status">
            <span>[ PRIVATE ]</span>
            <strong>Approved members only</strong>
            <p>Login, lab approval, Row Level Security, and private evidence storage protect colony records.</p>
          </aside>
        </div>
      </section>

      <section className="access-panel">
        {showRegister && (
          <form className="access-card" onSubmit={submitAccount}>
            <div>
              <h2>{effectiveAuthMode === 'signin' ? 'Sign in to TU Lab Colony' : effectiveAuthMode === 'register' ? 'Create your TU Lab account' : effectiveAuthMode === 'forgot' ? 'Reset your password' : 'Choose a new password'}</h2>
              <p>{effectiveAuthMode === 'forgot'
                ? 'Enter your registered email and we will send you a secure reset link.'
                : effectiveAuthMode === 'reset'
                  ? 'Use at least 6 characters. You will sign in again after the password is updated.'
                  : productionReady
                    ? 'Use your approved TU Lab account. New members can register and request viewer access after email confirmation.'
                    : 'Local preview only. New users start as viewers, and lab owners approve access before colony data is visible.'}</p>
            </div>
            {effectiveAuthMode === 'register' && <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>}
            {effectiveAuthMode !== 'reset' && <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>}
            {productionReady && effectiveAuthMode !== 'forgot' && <label>{effectiveAuthMode === 'reset' ? 'New password' : 'Password'}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} /></label>}
            {effectiveAuthMode === 'reset' && <label>Confirm new password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={6} /></label>}
            {accessError && <p className="account-note danger">{accessError}</p>}
            {accessNotice && <p className="account-note">{accessNotice}</p>}
            <button className="button primary" type="submit" disabled={isBusy}>{effectiveAuthMode === 'signin' ? 'Sign in' : effectiveAuthMode === 'register' ? 'Create account' : effectiveAuthMode === 'forgot' ? 'Send reset link' : 'Update password'}<ArrowRight size={16} /></button>
            {productionReady && (
              <div className="auth-actions">
                {effectiveAuthMode === 'signin' && <button type="button" className="button secondary" onClick={() => { setAccessError(''); setAccessNotice(''); setAuthMode('forgot') }}>Forgot password?</button>}
                {effectiveAuthMode !== 'reset' && <button type="button" className="button secondary" onClick={() => { setAccessError(''); setAccessNotice(''); setAuthMode(effectiveAuthMode === 'signin' ? 'register' : 'signin') }}>
                  {effectiveAuthMode === 'signin' ? 'Create a new account' : 'Back to sign in'}
                </button>}
                {(effectiveAuthMode === 'signin' || effectiveAuthMode === 'register') && <button type="button" className="button secondary" onClick={() => signInWithGoogle()}><MailCheck size={16} />Continue with Google</button>}
              </div>
            )}
          </form>
        )}

        {state.status === 'registered_unverified' && (
          <div className="access-card">
            <MailCheck size={28} />
            <div><h2>Confirmation email sent</h2><p>Please confirm your email, then request access to the TU Lab workspace. Colony data stays hidden until an owner or admin approves you.</p></div>
            <div className="auth-actions">
              <button className="button primary" onClick={() => onChange(markEmailVerified(state))}>I verified my email</button>
              <button className="button secondary" onClick={onLogOut}>Use another account</button>
            </div>
          </div>
        )}

        {state.status === 'lab_search' && (
          <div className="access-card">
            <div><h2>Request TU Lab access</h2><p>This is a private Yaping Tu Lab workspace. New members request access here, then an owner or admin approves the account before colony data is visible.</p></div>
            {tuLab ? (
              <div className="access-lab-result">
                <div><strong>{tuLab.name}</strong><span>{tuLab.institution}</span></div>
                <button className="button secondary" disabled={isBusy} onClick={() => submitLabAccess(tuLab)}>Request Yaping Tu Lab access</button>
              </div>
            ) : (
              <p className="account-note">Yaping Tu Lab is not available yet. Ask the manager to confirm the Supabase lab directory entry.</p>
            )}
            {accessError && <p className="account-note danger">{accessError}</p>}
            <button className="button secondary" onClick={onLogOut}>Use another account</button>
          </div>
        )}

        {state.status === 'lab_access_pending' && (
          <div className="access-card">
            <ShieldCheck size={28} />
            <div><h2>Waiting for manager approval</h2><p>Your request to join {state.pendingWorkspaceName} is pending. Only approved TU Lab owners/admins can approve access.</p></div>
            {accessError && <p className="account-note danger">{accessError}</p>}
            <div className="auth-actions">
              {productionReady
                ? <button className="button primary" disabled={isBusy} onClick={checkApprovalAndEnter}>Check approval and enter</button>
                : <button className="button primary" onClick={() => onChange(approveWorkspaceAccess(state))}>Local manager approve access</button>}
              <button className="button secondary" onClick={onLogOut}>Log out</button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

function Metric({ label, value, detail, tone }: { label: string; value: string | number; detail: string; tone?: string }) {
  return <div className={`metric ${tone || ''}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
}

function ProtocolLibrary({ rows, onAdd, onEdit, onDelete }: {
  rows: GenotypeProtocol[]
  onAdd: () => void
  onEdit: (protocol: GenotypeProtocol) => void
  onDelete: (protocolId: string) => void
}) {
  return (
    <div className="protocol-page">
      <div className="table-panel">
        <div className="table-toolbar">
          <span>{rows.length} genotype protocols</span>
          <div className="table-actions">
            <span>Primer, PCR program, expected bands, SOP files</span>
            <button className="button secondary table-action-button" onClick={onAdd}><CirclePlus size={15} />Add protocol</button>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="empty-protocol-state">
            <BookOpenText size={28} />
            <strong>No genotype protocols yet</strong>
            <span>Add primers, PCR programs, gel interpretation notes, and SOP photos/PDFs for each line.</span>
          </div>
        ) : (
          <div className="protocol-grid">
            {rows.map((protocol) => (
              <article className="protocol-card" key={protocol.id}>
                <div className="protocol-card-head">
                  <div>
                    <span className="eyebrow">{protocol.line}</span>
                    <h2>{protocol.name}</h2>
                    {protocol.targetGene && <small>{protocol.targetGene}</small>}
                  </div>
                  <span className="badge scheduled">{format(parseISO(protocol.updatedAt), 'MMM d, yyyy')}</span>
                </div>
                <div className="protocol-section">
                  <strong>Primers</strong>
                  <p>{protocol.primers || '—'}</p>
                </div>
                <div className="protocol-section">
                  <strong>PCR program</strong>
                  <p>{protocol.pcrProgram || '—'}</p>
                </div>
                <div className="protocol-section">
                  <strong>PCR reaction system</strong>
                  <p>{protocol.pcrReactionSystem || '—'}</p>
                </div>
                <div className="protocol-meta-grid">
                  <div><strong>Expected bands</strong><span>{protocol.expectedBands || '—'}</span></div>
                  <div><strong>Files</strong><span>{protocol.attachments?.length ? protocol.attachments.map((attachment) => attachment.originalName).join(', ') : '—'}</span></div>
                </div>
                {protocol.notes && <div className="protocol-section"><strong>Notes</strong><p>{protocol.notes}</p></div>}
                <div className="row-actions protocol-actions">
                  <button className="button secondary table-action-button" onClick={() => onEdit(protocol)}><Pencil size={14} />Edit</button>
                  <button className="button danger table-action-button" onClick={() => onDelete(protocol.id)}><Trash2 size={14} />Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ProtocolDialog({ lines, defaultLine, initialProtocol, onClose, onSave }: {
  lines: string[]
  defaultLine: string
  initialProtocol?: GenotypeProtocol
  onClose: () => void
  onSave: (protocol: GenotypeProtocol, files: File[]) => Promise<void>
}) {
  const [line, setLine] = useState(initialProtocol?.line ?? defaultLine ?? lines[0] ?? '')
  const [name, setName] = useState(initialProtocol?.name ?? '')
  const [targetGene, setTargetGene] = useState(initialProtocol?.targetGene ?? '')
  const [primers, setPrimers] = useState(initialProtocol?.primers ?? '')
  const [pcrReactionSystem, setPcrReactionSystem] = useState(initialProtocol?.pcrReactionSystem ?? '')
  const [pcrProgram, setPcrProgram] = useState(initialProtocol?.pcrProgram ?? '')
  const [expectedBands, setExpectedBands] = useState(initialProtocol?.expectedBands ?? '')
  const [notes, setNotes] = useState(initialProtocol?.notes ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const chooseFiles = (fileList?: FileList | null) => {
    const nextFiles = Array.from(fileList ?? [])
    const errors = nextFiles.flatMap(validateAttachment)
    if (errors.length) {
      setError(Array.from(new Set(errors)).join(' '))
      return
    }
    setError('')
    setFiles(nextFiles)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({
        id: initialProtocol?.id ?? `protocol-${line}-${Date.now()}`,
        line,
        name,
        targetGene: targetGene || undefined,
        primers,
        pcrReactionSystem: pcrReactionSystem || undefined,
        pcrProgram,
        expectedBands: expectedBands || undefined,
        notes: notes || undefined,
        attachmentIds: initialProtocol?.attachmentIds ?? [],
        attachments: initialProtocol?.attachments ?? [],
        updatedAt: initialProtocol?.updatedAt ?? new Date().toISOString(),
      }, files)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save protocol.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal protocol-modal" role="dialog" aria-modal="true" aria-label="Genotype protocol" onSubmit={submit}>
        <div className="modal-header">
          <div><h2>{initialProtocol ? 'Edit genotype protocol' : 'Add genotype protocol'}</h2><span>Keep primers, PCR reaction system, PCR program, gel interpretation, and SOP files in one place.</span></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="form-grid">
          <label>Colony line<select value={line} onChange={(event) => setLine(event.target.value)} required>{lines.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Protocol name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="RGS2 KO genotyping" required /></label>
          <label>Target gene / allele<input value={targetGene} onChange={(event) => setTargetGene(event.target.value)} placeholder="Rgs2, Prex1, Arhgef-25..." /></label>
          <label>Expected bands<input value={expectedBands} onChange={(event) => setExpectedBands(event.target.value)} placeholder="WT 420 bp; KO 280 bp; HET both" /></label>
        </div>
        <label>Primers<textarea value={primers} onChange={(event) => setPrimers(event.target.value)} placeholder="Forward / reverse primer names, sequences, working concentration..." required /></label>
        <label>PCR reaction system<textarea value={pcrReactionSystem} onChange={(event) => setPcrReactionSystem(event.target.value)} placeholder="Example: 2x Taq mix 10 ul; forward primer 0.5 ul; reverse primer 0.5 ul; DNA 1 ul; water 8 ul; total 20 ul..." /></label>
        <label>PCR program<textarea value={pcrProgram} onChange={(event) => setPcrProgram(event.target.value)} placeholder="95C 3 min; 35 cycles: 95C 30s, 60C 30s, 72C 45s; 72C 5 min..." required /></label>
        <label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Gel percent, ladder, PCR mix, troubleshooting, old SOP location..." /></label>
        <label className="gel-upload"><Upload size={16} />Upload SOP / primer sheet / gel example<input aria-label="Genotype protocol files" type="file" multiple accept="image/jpeg,image/png,image/heic,image/heif,application/pdf" onChange={(event) => chooseFiles(event.target.files)} /></label>
        {(initialProtocol?.attachments?.length || files.length > 0) && (
          <div className="attachment-list">
            {initialProtocol?.attachments?.map((attachment) => <span key={attachment.id}>{attachment.originalName}</span>)}
            {files.map((file) => <span key={file.name}>{file.name}</span>)}
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save protocol'}</button>
        </div>
      </form>
    </div>
  )
}

function EuthanasiaDialog({ lines, cages, defaultLine, onClose, onSave }: {
  lines: string[]
  cages: IndividualCage[]
  defaultLine: string
  onClose: () => void
  onSave: (record: { cageId: string; date: string; count: number; reason: string; notes: string; cardFile: File | null }) => Promise<void>
}) {
  const initialLine = cages.some((cage) => cage.line === defaultLine) ? defaultLine : cages[0]?.line ?? lines[0] ?? ''
  const [line, setLine] = useState(initialLine)
  const lineCages = useMemo(() => cages.filter((cage) => cage.line === line), [cages, line])
  const [cageId, setCageId] = useState(lineCages[0]?.id || '')
  const selectedCage = cages.find((cage) => cage.id === cageId) ?? lineCages[0]
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [count, setCount] = useState(1)
  const [reason, setReason] = useState('Experiment completed')
  const [notes, setNotes] = useState('')
  const [cardFile, setCardFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  const changeLine = (next: string) => {
    setLine(next)
    setCageId(cages.find((cage) => cage.line === next)?.id || '')
  }

  const chooseFile = (file?: File) => {
    if (!file) return
    const errors = validateAttachment(file)
    if (errors.length) {
      setError(errors.join(' '))
      return
    }
    setError('')
    setCardFile(file)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedCage) {
      setError('Choose an individual cage first.')
      return
    }
    if (count < 1 || count > selectedCage.count) {
      setError(`Count must be between 1 and ${selectedCage.count}.`)
      return
    }
    setError('')
    await onSave({ cageId: selectedCage.id, date, count, reason, notes, cardFile })
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" role="dialog" aria-modal="true" aria-label="Record euthanasia" onSubmit={submit}>
        <div className="modal-header">
          <div><h2>Euthanasia record</h2><span>Upload the cage card and automatically update individual cage counts.</span></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="form-grid">
          <label>Line<select value={line} onChange={(event) => changeLine(event.target.value)} required>{lines.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Individual cage<select value={selectedCage?.id ?? ''} onChange={(event) => setCageId(event.target.value)} required>
            {lineCages.map((cage) => <option value={cage.id} key={cage.id}>{cage.cage} · {cage.genotype} · {cage.sex} · {cage.count} mice</option>)}
          </select></label>
          <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
          <label>Number euthanized<input type="number" min="1" max={selectedCage?.count ?? 1} value={count} onChange={(event) => setCount(Number(event.target.value))} required /></label>
          <label>Reason<select value={reason} onChange={(event) => setReason(event.target.value)}>
            <option>Experiment completed</option>
            <option>Old age</option>
            <option>Health concern</option>
            <option>Colony reduction</option>
            <option>Other</option>
          </select></label>
          <label className="gel-upload"><Upload size={16} />Card photo / PDF<input aria-label="Euthanasia card photo" type="file" accept="image/jpeg,image/png,image/heic,image/heif,application/pdf" onChange={(event) => chooseFile(event.target.files?.[0])} /></label>
        </div>
        <label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Experiment name, tissue collected, mouse numbers, or other archive notes..." /></label>
        {selectedCage && <div className="date-preview"><MousePointer2 size={18} /><div><strong>{selectedCage.cage}: {selectedCage.count} mice now</strong><span>After saving, {Math.max(0, selectedCage.count - count)} will remain. Dashboard updates automatically.</span></div></div>}
        {cardFile && <div className="attachment-list"><span>{cardFile.name}</span></div>}
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" type="submit" disabled={!selectedCage}>Save euthanasia record</button>
        </div>
      </form>
    </div>
  )
}

function BreedingCageDialog({ lines, defaultLine, initialCage, onClose, onSave }: {
  lines: string[]
  defaultLine: string
  initialCage?: BreedingCage
  onClose: () => void
  onSave: (cage: BreedingCage) => void
}) {
  const [line, setLine] = useState(initialCage?.line ?? defaultLine ?? lines[0] ?? '')
  const [cage, setCage] = useState(initialCage?.cage ?? '')
  const [maleGenotype, setMaleGenotype] = useState<Genotype>(initialCage?.maleGenotype ?? 'WT')
  const [maleDob, setMaleDob] = useState(initialCage?.maleDob ?? '')
  const [femaleGenotype, setFemaleGenotype] = useState<Genotype>(initialCage?.femaleGenotype ?? 'WT')
  const [femaleDob, setFemaleDob] = useState(initialCage?.femaleDob ?? '')
  const [extraFemale, setExtraFemale] = useState(initialCage?.extraFemale ?? '')
  const [pupsDob, setPupsDob] = useState(initialCage?.pupsDob ?? '')
  const [pupsCount, setPupsCount] = useState(initialCage?.pupsCount ?? 0)
  const [genotypeNeeded, setGenotypeNeeded] = useState(Boolean(initialCage?.genotypeNeeded))
  const [priority, setPriority] = useState(Boolean(initialCage?.priority))
  const [notes, setNotes] = useState(initialCage?.notes ?? '')
  const pairing = `${maleGenotype}/${femaleGenotype}`

  return (
    <div className="modal-backdrop">
      <form className="modal" role="dialog" aria-modal="true" onSubmit={(event) => {
        event.preventDefault()
        onSave({
          id: initialCage?.id ?? `manual-breeding-${line}-${cage}-${Date.now()}`,
          line,
          cage,
          pairing,
          maleGenotype,
          maleDob,
          femaleGenotype,
          femaleDob,
          extraFemale: extraFemale || undefined,
          pupsDob: pupsDob || undefined,
          pupsCount: pupsCount > 0 ? pupsCount : undefined,
          genotypeNeeded,
          priority,
          notes,
          customFields: initialCage?.customFields,
        })
      }}>
        <div className="modal-header">
          <div><h2>{initialCage ? 'Edit breeding cage' : 'Add breeding cage'}</h2><span>Update parent, litter, genotype, and attention details.</span></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="form-grid">
          <label>Cage line<select value={line} onChange={(event) => setLine(event.target.value)} required>{lines.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Cage number<input value={cage} onChange={(event) => setCage(event.target.value)} required /></label>
          <label>Male genotype<select value={maleGenotype} onChange={(event) => setMaleGenotype(event.target.value as Genotype)}>{genotypeDisplayOrder.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Male DOB<input type="date" value={maleDob} onChange={(event) => setMaleDob(event.target.value)} required /></label>
          <label>Female genotype<select value={femaleGenotype} onChange={(event) => setFemaleGenotype(event.target.value as Genotype)}>{genotypeDisplayOrder.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Female DOB<input type="date" value={femaleDob} onChange={(event) => setFemaleDob(event.target.value)} required /></label>
          <label>Extra female / pairing note<input value={extraFemale} onChange={(event) => setExtraFemale(event.target.value)} /></label>
          <label>Pups DOB<input type="date" value={pupsDob} onChange={(event) => setPupsDob(event.target.value)} /></label>
          <label>Pups count<input type="number" min="0" value={pupsCount} onChange={(event) => setPupsCount(Number(event.target.value))} /></label>
        </div>
        <div className="checkbox-row">
          <label><input type="checkbox" checked={genotypeNeeded} onChange={(event) => setGenotypeNeeded(event.target.checked)} />Genotype needed</label>
          <label><input type="checkbox" checked={priority} onChange={(event) => setPriority(event.target.checked)} />Priority cage</label>
        </div>
        <label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Replacement reason, pairing plan, special attention..." /></label>
        <div className="date-preview"><Users size={18} /><div><strong>{pairing}</strong><span>Pairing updates automatically from male/female genotype.</span></div></div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" type="submit">Save breeding cage</button>
        </div>
      </form>
    </div>
  )
}

function IndividualCageDialog({ lines, defaultLine, initialCage, onClose, onSave }: {
  lines: string[]
  defaultLine: string
  initialCage?: IndividualCage
  onClose: () => void
  onSave: (cage: IndividualCage) => void
}) {
  const [line, setLine] = useState(initialCage?.line ?? defaultLine ?? lines[0] ?? '')
  const [cage, setCage] = useState(initialCage?.cage ?? '')
  const [genotypeValue, setGenotypeValue] = useState<Genotype>(initialCage?.genotype ?? 'WT')
  const [sex, setSex] = useState<Sex>(initialCage?.sex ?? 'Male')
  const [dob, setDob] = useState(initialCage?.dob ?? '')
  const [count, setCount] = useState(initialCage?.count ?? 1)
  const [genotypeMap, setGenotypeMap] = useState(initialCage?.genotypeMap ?? '')
  const [notes, setNotes] = useState(initialCage?.notes ?? '')

  return (
    <div className="modal-backdrop">
      <form className="modal" role="dialog" aria-modal="true" onSubmit={(event) => {
        event.preventDefault()
        onSave({
          id: initialCage?.id ?? `manual-individual-${line}-${cage || 'auto'}-${Date.now()}`,
          line,
          cage: cage.trim() || 'Auto',
          genotype: genotypeValue,
          sex,
          dob,
          count: Math.max(1, count),
          genotypeMap,
          notes,
          sourceLitterId: initialCage?.sourceLitterId,
          sourcePupIds: initialCage?.sourcePupIds,
          customFields: initialCage?.customFields,
        })
      }}>
        <div className="modal-header">
          <div><h2>{initialCage ? 'Edit individual cage' : 'Add individual cage'}</h2><span>Update genotype, sex, DOB, count, mouse map, and notes.</span></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="form-grid">
          <label>Cage line<select value={line} onChange={(event) => setLine(event.target.value)} required>{lines.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Cage label<input value={cage} onChange={(event) => setCage(event.target.value)} placeholder="Auto" required={Boolean(initialCage)} /></label>
          <label>Genotype<select value={genotypeValue} onChange={(event) => setGenotypeValue(event.target.value as Genotype)}>{genotypeDisplayOrder.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Sex<select value={sex} onChange={(event) => setSex(event.target.value as Sex)}>{['Male', 'Female', 'Mixed', 'Unknown'].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>DOB<input type="date" value={dob} onChange={(event) => setDob(event.target.value)} required /></label>
          <label>Count<input type="number" min="1" value={count} onChange={(event) => setCount(Number(event.target.value))} required /></label>
        </div>
        <label>Mouse number map<textarea value={genotypeMap} onChange={(event) => setGenotypeMap(event.target.value)} placeholder="#1 KO; #2 HET; #3 WT" /></label>
        <label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Experiment-ready, reserve, transferred from litter..." /></label>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" type="submit">Save individual cage</button>
        </div>
      </form>
    </div>
  )
}

function BreedingTable({ rows, onAdd, onEdit, onDelete }: { rows: BreedingCage[]; onAdd: () => void; onEdit: (cage: BreedingCage) => void; onDelete: (cageId: string) => void }) {
  return (
    <div className="table-panel">
      <div className="table-toolbar">
        <span>{rows.length} cages</span>
        <div className="table-actions">
          <div className="legend"><i className="priority-key" />Priority <i className="age-key" />Older breeder</div>
          <button className="button secondary table-action-button" onClick={onAdd}><CirclePlus size={15} />Add breeding cage</button>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Actions</th><th>Line / cage</th><th>Pairing</th><th>Male</th><th>Female</th><th>Pups</th><th>Wean</th><th>Genotype</th><th>Notes</th></tr></thead>
          <tbody>
            {rows.map((cage) => {
              const window = genotypeWindow(cage)
              const status = weanStatus(cage)
              return (
                <tr key={cage.id} className={cage.priority ? 'priority-row' : ''}>
                  <td>
                    <div className="row-actions">
                      <button className="button secondary table-action-button" onClick={() => onEdit(cage)} aria-label={`Edit breeding cage ${cage.cage}`}><Pencil size={14} />Edit</button>
                      <button className="button danger table-action-button" onClick={() => onDelete(cage.id)} aria-label={`Delete breeding cage ${cage.cage}`}><Trash2 size={14} />Delete</button>
                    </div>
                  </td>
                  <td><strong>{cage.line}</strong><span>Cage {cage.cage}</span></td>
                  <td><span className="genotype-chip">{cage.pairing}</span>{cage.extraFemale && <small>{cage.extraFemale}</small>}</td>
                  <td><strong>{cage.maleGenotype}</strong><span>{fmt(cage.maleDob)} · {ageLabel(cage.maleDob)}</span>{breederAlert(cage.maleDob) && <small className="age-alert">Consider younger breeder</small>}</td>
                  <td><strong>{cage.femaleGenotype}</strong><span>{fmt(cage.femaleDob)} · {ageLabel(cage.femaleDob)}</span>{breederAlert(cage.femaleDob) && <small className="age-alert">Consider younger breeder</small>}</td>
                  <td>{cage.pupsDob ? <><strong>{fmt(cage.pupsDob)}</strong><span>{cage.pupsCount ? `${cage.pupsCount} pups` : 'Count not recorded'}</span></> : <span>—</span>}</td>
                  <td><span className={`badge ${status.tone}`}>{status.label}</span>{weanDate(cage) && <small>{fmt(format(weanDate(cage)!, 'yyyy-MM-dd'))}</small>}</td>
                  <td>{window ? <><strong>{format(window[0], 'MMM d')}–{format(window[1], 'MMM d')}</strong><span>P7–P11</span></> : <span>Not required</span>}</td>
                  <td className="notes-cell">{cage.priority && <AlertTriangle size={15} />}{cage.notes || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function IndividualTable({ rows, dashboardFilter, onClearDashboardFilter, onAdd, onEdit, onDelete, onRenumber }: {
  rows: IndividualCage[]
  dashboardFilter: IndividualDashboardFilter | null
  onClearDashboardFilter: () => void
  onAdd: () => void
  onEdit: (cage: IndividualCage) => void
  onDelete: (cageId: string) => void
  onRenumber: () => void
}) {
  const filterLabel = dashboardFilter
    ? [dashboardFilter.bucketLabel, dashboardFilter.genotype, dashboardFilter.sex].filter(Boolean).join(' · ')
    : ''

  return (
    <div className="table-panel">
      <div className="table-toolbar">
        <span>{rows.length} cages · {rows.reduce((sum, cage) => sum + cage.count, 0)} mice</span>
        <div className="table-actions">
          <span>Mixed cages are counted by mouse number map</span>
          <button className="button secondary table-action-button" onClick={onRenumber}>Auto-sort cage numbers</button>
          <button className="button secondary table-action-button" onClick={onAdd}><CirclePlus size={15} />Add individual cage</button>
        </div>
      </div>
      {dashboardFilter && (
        <div className="dashboard-filter-banner">
          <span>Dashboard filter: <strong>{filterLabel}</strong></span>
          <button className="button secondary table-action-button" onClick={onClearDashboardFilter}>Clear filter</button>
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead><tr><th>Actions</th><th>Line / cage</th><th>Genotype</th><th>Sex</th><th>DOB / age</th><th>Count</th><th>Mouse number map</th><th>Notes</th></tr></thead>
          <tbody>{rows.map((cage) => (
            <tr key={cage.id} className={cage.genotype === 'Mixed' ? 'mixed-row' : ''}>
              <td>
                <div className="row-actions">
                  <button className="button secondary table-action-button" onClick={() => onEdit(cage)} aria-label={`Edit individual cage ${cage.cage}`}><Pencil size={14} />Edit</button>
                  <button className="button danger table-action-button" onClick={() => onDelete(cage.id)} aria-label={`Delete individual cage ${cage.cage}`}><Trash2 size={14} />Delete</button>
                </div>
              </td>
              <td><strong>{cage.line}</strong><span>Cage {cage.cage}</span></td>
              <td><span className={`genotype-chip genotype-${cage.genotype.toLowerCase()}`}>{cage.genotype}</span></td>
              <td>{cage.sex}</td>
              <td><strong>{fmt(cage.dob)}</strong><span>{ageLabel(cage.dob, cage.line)}</span></td>
              <td><strong>{cage.count}</strong></td>
              <td className="mapping">{cage.genotypeMap || '—'}</td>
              <td>{cage.notes || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

function WorkTable({ rows }: { rows: WorkEntry[] }) {
  const [archiveMonth, setArchiveMonth] = useState(format(new Date(), 'yyyy-MM'))
  const euthanasiaRows = rows.filter((entry) => entry.type === 'Euthanasia' && entry.date.startsWith(archiveMonth))
  const printEuthanasiaArchive = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    const rowsHtml = euthanasiaRows.map((entry) => `
      <article>
        <h2>${escapeHtml(entry.line)} · Cage ${escapeHtml(entry.cage)}</h2>
        <p><strong>Date:</strong> ${escapeHtml(fmt(entry.date))}</p>
        <p><strong>Description:</strong> ${escapeHtml(entry.description)}</p>
        <p><strong>Card file:</strong> ${escapeHtml(entry.attachments?.map((attachment) => attachment.originalName).join(', ') || 'No card uploaded')}</p>
      </article>
    `).join('')
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>TU Lab euthanasia archive ${archiveMonth}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #14211b; margin: 32px; }
            h1 { font-size: 22px; margin: 0 0 6px; }
            .meta { color: #64746b; margin: 0 0 22px; }
            article { break-inside: avoid; border: 1px solid #d9e2dd; border-radius: 8px; padding: 16px; margin: 0 0 14px; }
            h2 { font-size: 16px; margin: 0 0 10px; }
            p { font-size: 12px; line-height: 1.5; margin: 6px 0; }
          </style>
        </head>
        <body>
          <h1>TU Lab euthanasia card archive</h1>
          <p class="meta">${archiveMonth} · ${euthanasiaRows.length} record${euthanasiaRows.length === 1 ? '' : 's'}</p>
          ${rowsHtml || '<p>No euthanasia records for this month.</p>'}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  return (
    <div className="table-panel">
      <div className="table-toolbar">
        <span>{rows.length} work records</span>
        <div className="table-actions work-archive-actions">
          <span>Births, weans, mouse changes, genotype and follow-ups</span>
          <input aria-label="Euthanasia archive month" type="month" value={archiveMonth} onChange={(event) => setArchiveMonth(event.target.value)} />
          <button className="button secondary table-action-button" onClick={printEuthanasiaArchive}><Printer size={15} />Print euthanasia cards</button>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Date</th><th>Line / cage</th><th>Work type</th><th>Description</th><th>Attachments</th><th>Follow-up</th></tr></thead>
          <tbody>{rows.map((entry) => (
            <tr key={entry.id}>
              <td><strong>{fmt(entry.date)}</strong></td>
              <td><strong>{entry.line}</strong><span>Cage {entry.cage}</span></td>
              <td><span className="work-chip">{entry.type}</span></td>
              <td>{entry.description}</td>
              <td>{entry.attachments?.length ? entry.attachments.map((attachment) => <span key={attachment.id}>{attachment.originalName}</span>) : '—'}</td>
              <td>{entry.followUpDate ? fmt(entry.followUpDate) : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function AccountBillingPage({
  workspace,
  testUser,
  testUserName,
  testUserEmail,
  workspaceQuery,
  onTestUserName,
  onTestUserEmail,
  onWorkspaceQuery,
  onRegister,
  onRequestAccess,
  onApprove,
  onRemoveMember,
  productionConnections,
}: {
  workspace: LabWorkspace
  testUser: AccountUser | null
  testUserName: string
  testUserEmail: string
  workspaceQuery: string
  onTestUserName: (value: string) => void
  onTestUserEmail: (value: string) => void
  onWorkspaceQuery: (value: string) => void
  onRegister: () => void
  onRequestAccess: () => void
  onApprove: () => void
  onRemoveMember: (memberId: string) => void
  productionConnections: ProductionConnection[]
}) {
  const labMatches = searchWorkspaces([workspace], workspaceQuery)
  const pendingRequest = workspace.requests.find((request) => request.status === 'Pending')
  const pendingRequests = workspace.requests.filter((request) => request.status === 'Pending')

  return (
    <div className="account-grid">
      <section className="panel account-hero">
        <div>
          <span className="eyebrow">WORKSPACE</span>
          <h2>{workspace.name}</h2>
          <p>Only approved TU Lab members can see colony data. Owners/admins manage viewer access and can remove members when lab roles change.</p>
        </div>
        <div className="account-stats">
          <span><strong>{workspace.members.length}</strong> members</span>
          <span><strong>{workspace.requests.filter((request) => request.status === 'Pending').length}</strong> pending</span>
          <span><strong>Free beta</strong> TU Lab</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>Management account</h2><span>You and PI can be owners/admins</span></div><ShieldCheck size={19} /></div>
        <div className="account-card-list">
          {workspace.members.map((member) => (
            <div className="member-row" key={member.id}>
              <div><strong>{member.name}</strong><span>{member.email}</span></div>
              <div className="member-actions">
                <span className="badge scheduled">{member.role}</span>
                {member.role !== 'Owner' && <button className="button danger" onClick={() => onRemoveMember(member.id)}>Remove {member.name}</button>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>New user registration test</h2><span>Default access is viewer</span></div><Users size={19} /></div>
        <div className="account-form">
          <label>Test user name
            <input value={testUserName} onChange={(event) => onTestUserName(event.target.value)} />
          </label>
          <label>Test user Gmail
            <input value={testUserEmail} onChange={(event) => onTestUserEmail(event.target.value)} />
          </label>
          <button className="button primary" onClick={onRegister}>Register test user</button>
          {testUser && <p className="account-note">Verification email queued for {testUser.email}. Default role after approval: {testUser.defaultRole}.</p>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><h2>Join workspace</h2><span>Search lab and request viewer access</span></div><Search size={19} /></div>
        <div className="account-form">
          <label>Find lab workspace
            <input value={workspaceQuery} onChange={(event) => onWorkspaceQuery(event.target.value)} placeholder="TU Lab" />
          </label>
          {labMatches.length > 0 && <div className="lab-result"><strong>TU Lab found</strong><span>{workspace.members.length} approved members</span></div>}
          <button className="button secondary" onClick={onRequestAccess} disabled={!testUser || labMatches.length === 0}>Request viewer access</button>
          <div className="request-list">
            {pendingRequests.map((request) => (
              <div className="member-row" key={request.id}>
                <div><strong>{request.name}</strong><span>{request.email}</span></div>
                <span className={`badge ${request.status === 'Pending' ? 'warning' : 'scheduled'}`}>{request.status}</span>
              </div>
            ))}
          </div>
          <button className="button primary" onClick={onApprove} disabled={!pendingRequest}>Approve viewer</button>
        </div>
      </section>

      <section className="panel production-panel">
        <div className="panel-header"><div><h2>Production connections</h2><span>Used for login, approvals, shared data, and evidence photos</span></div><ShieldCheck size={19} /></div>
        <div className="connection-list">
          {productionConnections.map((connection) => (
            <div className="connection-row" key={connection.id}>
              <div><strong>{connection.label}</strong><span>{connection.detail}</span></div>
              <span className={`badge ${connection.status === 'Ready' ? 'done' : 'warning'}`}>{connection.status}</span>
            </div>
          ))}
        </div>
        <p className="account-note">TU Lab internal users are free. Privacy is protected by email login, owner/admin approval, Row Level Security, and private evidence-photo storage.</p>
      </section>
    </div>
  )
}

export default App
