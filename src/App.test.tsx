// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { authStorageKey } from './domain/authFlow'

vi.mock('./services/productionConfig', () => ({
  getProductionConfig: () => ({
    supabaseUrl: '',
    supabaseAnonKey: '',
    stripePriceId: '',
    appUrl: 'http://127.0.0.1:5174',
    supabaseReady: false,
    stripeReady: false,
  }),
}))

describe('TU Lab Colony access gate', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('guides a new user from registration to approved lab access', () => {
    render(<App />)

    expect(screen.getByText('TU Lab Colony')).toBeInTheDocument()
    expect(screen.getByText('TU Lab mouse colony manager')).toBeInTheDocument()
    expect(screen.queryByText('Colony overview')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'New Member' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'member@gmail.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.getByText('Confirmation email sent')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'I verified my email' }))

    expect(screen.getByText('Yaping Tu Lab')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Request Yaping Tu Lab access' }))

    expect(screen.getByText('Waiting for manager approval')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Local manager approve access' }))

    expect(screen.getByText('Colony overview')).toBeInTheDocument()
  })
})

describe('colony line filtering', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(authStorageKey, JSON.stringify({ status: 'workspace_approved', selectedWorkspaceId: 'tu-lab' }))
  })

  afterEach(() => {
    cleanup()
  })

  it('updates dashboard metrics when a colony line is selected', () => {
    const { container } = render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'RGS2' }))

    const [breedingMetric, individualMetric] = container.querySelectorAll<HTMLElement>('.metric')

    expect(within(breedingMetric).getByText('9')).toBeInTheDocument()
    expect(within(individualMetric).getByText('12')).toBeInTheDocument()
    expect(within(individualMetric).getByText('32 mice recorded')).toBeInTheDocument()
  })

  it('archives and restores a colony line from the sidebar', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Manage LARG' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive colony' }))

    expect(screen.queryByRole('button', { name: 'LARG' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore LARG' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Restore LARG' }))
    expect(screen.getByRole('button', { name: 'LARG' })).toBeInTheDocument()
  })

  it('requires the line name before permanently deleting linked records', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Manage LARG' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete colony' }))

    const deleteButton = screen.getByRole('button', { name: 'Delete LARG permanently' })
    expect(deleteButton).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type LARG to confirm'), { target: { value: 'LARG' } })
    fireEvent.click(deleteButton)

    expect(screen.queryByRole('button', { name: 'LARG' })).not.toBeInTheDocument()
    const stored = JSON.parse(localStorage.getItem('colony-ops-data-v3') ?? '{}').data
    expect(stored.breeding.some((record: { line: string }) => record.line === 'LARG')).toBe(false)
    expect(stored.individual.some((record: { line: string }) => record.line === 'LARG')).toBe(false)
    expect(stored.work.some((record: { line: string }) => record.line === 'LARG')).toBe(false)
    expect(stored.litters.some((record: { line: string }) => record.line === 'LARG')).toBe(false)
    expect(stored.protocols.some((record: { line: string }) => record.line === 'LARG')).toBe(false)
  })

  it('loads every confirmed breeding and individual cage', () => {
    const { container } = render(<App />)
    const [breedingMetric, individualMetric] = container.querySelectorAll<HTMLElement>('.metric')

    expect(within(breedingMetric).getByText('49')).toBeInTheDocument()
    expect(within(individualMetric).getByText('62')).toBeInTheDocument()
    expect(within(individualMetric).getByText('153 mice recorded')).toBeInTheDocument()

    const overview = screen.getByRole('region', { name: 'Colony overview' })
    expect(within(overview).getByText('Prex1')).toBeInTheDocument()
    expect(within(overview).getByText('RGS2')).toBeInTheDocument()
    expect(within(overview).getByText('Arhgef-25')).toBeInTheDocument()
  })

  it('opens and closes the current genotype summary report', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Genotype report' }))

    expect(await screen.findByRole('heading', { name: 'Genotype summary' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Arhgef-1 genotype summary' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close genotype report' }))
    expect(screen.queryByRole('heading', { name: 'Genotype summary' })).not.toBeInTheDocument()
  })

  it('copies and prints the generated genotype report', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Genotype report' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Copy report' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(writeText.mock.calls[0][0]).toMatch(/^TU Lab Colony - Genotype Summary/)
    expect(await screen.findByText('Genotype report copied.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Print / Save PDF' }))
    expect(print).toHaveBeenCalledOnce()
    print.mockRestore()
  })

  it('shows a useful message when the genotype report cannot be copied', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard unavailable')) },
    })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Genotype report' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Copy report' }))

    expect(await screen.findByText('Could not copy genotype report.')).toBeInTheDocument()
  })

  it('scopes the overview to the selected line and charts individual age availability', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Arhgef-25' }))

    const overview = screen.getByRole('region', { name: 'Colony overview' })
    expect(within(overview).queryByText('Prex1')).not.toBeInTheDocument()
    expect(within(overview).queryByText('RGS2')).not.toBeInTheDocument()
    expect(within(overview).getByText('Arhgef-25')).toBeInTheDocument()
    const arhgef25Summary = within(overview).getByRole('button', { name: /Arhgef-25/ })
    expect(within(arhgef25Summary).getByText('Breeding 13')).toBeInTheDocument()
    expect(within(arhgef25Summary).getByText('Individual 21')).toBeInTheDocument()

    const availability = screen.getByRole('region', { name: 'Individual age availability' })
    expect(within(availability).getByText('<6 weeks')).toBeInTheDocument()
    expect(within(availability).getByText('6-8 weeks')).toBeInTheDocument()
    expect(within(availability).getByText('>8 weeks-6 months')).toBeInTheDocument()
    expect(within(availability).getByText('6 months-1 year')).toBeInTheDocument()
    expect(within(availability).getByText('>1 year')).toBeInTheDocument()
    expect(within(availability).getAllByText('WT Male').length).toBeGreaterThan(0)
    expect(within(availability).getAllByText('WT Female').length).toBeGreaterThan(0)
    expect(within(availability).getAllByText('KO Male').length).toBeGreaterThan(0)
    expect(within(availability).getAllByText('KO Female').length).toBeGreaterThan(0)
    expect(within(availability).getAllByText('HET Male').length).toBeGreaterThan(0)
    expect(within(availability).getAllByText('HET Female').length).toBeGreaterThan(0)
    expect(within(availability).queryByText('Mixed')).not.toBeInTheDocument()
  })

  it('warns when a line has fewer than three mice for a core genotype', () => {
    localStorage.setItem('colony-ops-data-v3', JSON.stringify({
      version: 3,
      data: {
        breeding: [],
        individual: [
          { id: 'solo-wt', line: 'Solo Line', cage: '1', genotype: 'WT', sex: 'Male', dob: '2026-05-01', count: 2 },
          { id: 'solo-ko', line: 'Solo Line', cage: '2', genotype: 'KO', sex: 'Female', dob: '2026-05-01', count: 1 },
        ],
        work: [],
        litters: [],
        protocols: [],
      },
    }))

    render(<App />)

    const alerts = screen.getByRole('region', { name: 'Genotype inventory alerts' })
    expect(within(alerts).getByText('Solo Line · WT')).toBeInTheDocument()
    expect(within(alerts).getByText('Solo Line · KO')).toBeInTheDocument()
    expect(within(alerts).getAllByText('Low')).toHaveLength(2)
    expect(within(alerts).queryByText('Solo Line · HET')).not.toBeInTheDocument()
    expect(screen.getByText('WT/KO below 3')).toBeInTheDocument()

    fireEvent.click(within(alerts).getByText('Solo Line · WT').closest('button')!)
    expect(screen.getByRole('heading', { name: 'Individual cages' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('WT')).toBeInTheDocument()
  })

  it('opens genotype work from quick actions instead of find-a-mouse', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'New litter' }))
    fireEvent.change(screen.getByLabelText('Colony line'), { target: { value: 'RGS2' } })
    fireEvent.change(screen.getByLabelText('Breeding cage'), { target: { value: 'rgs2-b-7' } })
    fireEvent.change(screen.getByLabelText('Pups DOB'), { target: { value: '2026-06-01' } })
    fireEvent.change(screen.getByLabelText('Pups count'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save litter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))

    expect(screen.queryByText('Find a mouse')).not.toBeInTheDocument()
    const genotypeAction = screen.getByText('Record genotype').closest('button')
    expect(genotypeAction).not.toBeNull()

    fireEvent.click(genotypeAction!)

    expect(screen.getByText('RGS2-B07-20260601')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'RGS2-B07-20260601' }))
    expect(screen.getByText('Gel evidence and genotype results')).toBeInTheDocument()
  })

  it('shows genotype windows on the dashboard and opens the litter workspace', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'New litter' }))
    fireEvent.change(screen.getByLabelText('Colony line'), { target: { value: 'RGS2' } })
    fireEvent.change(screen.getByLabelText('Breeding cage'), { target: { value: 'rgs2-b-7' } })
    fireEvent.change(screen.getByLabelText('Pups DOB'), { target: { value: '2026-06-20' } })
    fireEvent.change(screen.getByLabelText('Pups count'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save litter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))

    const schedule = screen.getByRole('region', { name: 'Genotype schedule' })
    expect(within(schedule).getByText('P4-P11 windows before wean')).toBeInTheDocument()
    expect(within(schedule).getByText(/P4-P11 Jun 24-Jul 1/)).toBeInTheDocument()

    fireEvent.click(within(schedule).getByRole('button', { name: /RGS2-B07-20260620/ }))
    expect(screen.getByText('Gel evidence and genotype results')).toBeInTheDocument()
  })

  it('saves genotype protocol records from quick actions', async () => {
    render(<App />)

    fireEvent.click(screen.getByText('Genotype protocol').closest('button')!)
    fireEvent.change(screen.getByLabelText('Colony line'), { target: { value: 'RGS2' } })
    fireEvent.change(screen.getByLabelText('Protocol name'), { target: { value: 'RGS2 KO PCR' } })
    fireEvent.change(screen.getByLabelText('Target gene / allele'), { target: { value: 'Rgs2' } })
    fireEvent.change(screen.getByLabelText('Expected bands'), { target: { value: 'WT 420 bp; KO 280 bp' } })
    fireEvent.change(screen.getByLabelText('Primers'), { target: { value: 'F: AAA\nR: TTT' } })
    fireEvent.change(screen.getByLabelText('PCR reaction system'), { target: { value: '2x Taq mix 10 ul; DNA 1 ul; total 20 ul' } })
    fireEvent.change(screen.getByLabelText('PCR program'), { target: { value: '95C 3 min; 35 cycles; 72C 5 min' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save protocol' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Genotype protocols' })).toBeInTheDocument())
    expect(screen.getByText('RGS2 KO PCR')).toBeInTheDocument()
    expect(screen.getByText('WT 420 bp; KO 280 bp')).toBeInTheDocument()
    expect(screen.getByText('2x Taq mix 10 ul; DNA 1 ul; total 20 ul')).toBeInTheDocument()
  })

  it('keeps new litter separate from the genotype workspace until Record genotype is opened', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'New litter' }))
    expect(screen.queryByText('Gel upload appears after Save litter in the genotype workspace.')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Colony line'), { target: { value: 'RGS2' } })
    fireEvent.change(screen.getByLabelText('Breeding cage'), { target: { value: 'rgs2-b-7' } })
    fireEvent.change(screen.getByLabelText('Pups DOB'), { target: { value: '2026-06-01' } })
    fireEvent.change(screen.getByLabelText('Pups count'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save litter' }))

    expect(screen.queryByText('Gel evidence and genotype results')).not.toBeInTheDocument()
    expect(screen.getByText('RGS2-B07-20260601')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    fireEvent.click(screen.getByText('Record genotype').closest('button')!)

    fireEvent.click(screen.getByRole('button', { name: 'RGS2-B07-20260601' }))
    expect(screen.getByText('Gel evidence and genotype results')).toBeInTheDocument()
    expect(screen.getByLabelText('Gel image')).toBeInTheDocument()
    expect(screen.getByText('RGS2-B07-20260601')).toBeInTheDocument()
  })

  it('records known pup sex when creating a new litter', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'New litter' }))
    fireEvent.change(screen.getByLabelText('Colony line'), { target: { value: 'RGS2' } })
    fireEvent.change(screen.getByLabelText('Breeding cage'), { target: { value: 'rgs2-b-7' } })
    fireEvent.change(screen.getByLabelText('Pups DOB'), { target: { value: '2026-06-01' } })
    fireEvent.change(screen.getByLabelText('Pups count'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Male pups'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Female pups'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Unknown sex pups'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save litter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    fireEvent.click(screen.getByText('Record genotype').closest('button')!)

    fireEvent.click(screen.getByRole('button', { name: 'RGS2-B07-20260601' }))
    expect(screen.getByLabelText('Sex #1')).toHaveValue('Male')
    expect(screen.getByLabelText('Sex #2')).toHaveValue('Male')
    expect(screen.getByLabelText('Sex #3')).toHaveValue('Female')
    expect(screen.getByLabelText('Sex #4')).toHaveValue('Unknown')
  })

  it('records known pup genotype when creating a new litter', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'New litter' }))
    fireEvent.change(screen.getByLabelText('Colony line'), { target: { value: 'RGS2' } })
    fireEvent.change(screen.getByLabelText('Breeding cage'), { target: { value: 'rgs2-b-7' } })
    fireEvent.change(screen.getByLabelText('Pups DOB'), { target: { value: '2026-06-01' } })
    fireEvent.change(screen.getByLabelText('Pups count'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('WT pups'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('HET pups'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('KO pups'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Unknown genotype pups'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save litter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    fireEvent.click(screen.getByText('Record genotype').closest('button')!)

    fireEvent.click(screen.getByRole('button', { name: 'RGS2-B07-20260601' }))
    expect(screen.getByLabelText('Genotype #1')).toHaveValue('WT')
    expect(screen.getByLabelText('Genotype #2')).toHaveValue('HET')
    expect(screen.getByLabelText('Genotype #3')).toHaveValue('HET')
    expect(screen.getByLabelText('Genotype #4')).toHaveValue('KO')
    expect(screen.getByLabelText('Genotype #5')).toHaveValue('Unknown')
  })

  it('explains genotype workflow when no genotype litter exists yet', () => {
    localStorage.setItem('colony-ops-data-v3', JSON.stringify({
      version: 3,
      data: { breeding: [], individual: [], work: [], litters: [] },
    }))
    render(<App />)

    fireEvent.click(screen.getByText('Record genotype').closest('button')!)

    expect(screen.getByText('No litter workspaces yet')).toBeInTheDocument()
    expect(screen.getByText('Create a litter workspace for the old or current litter, then upload the gel image and tattoo-number genotype map.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create litter workspace' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows all litter cards in genotype mode so old results can be uploaded later', () => {
    localStorage.setItem('colony-ops-data-v3', JSON.stringify({
      version: 3,
      data: {
        breeding: [],
        individual: [],
        work: [],
        litters: [
          {
            id: 'not-due',
            reference: 'RGS2-B07-20260620',
            line: 'RGS2',
            breedingCageId: 'rgs2-b-7',
            breedingCageLabel: '7',
            dob: '2026-06-20',
            pupCount: 3,
            genotypeRequired: true,
            parents: [
              { sex: 'Male', genotype: 'HET', dob: '2025-07-30' },
              { sex: 'Female', genotype: 'HET', dob: '2025-07-30' },
            ],
            pups: [],
            attachmentIds: [],
            createdAt: '2026-06-20T00:00:00.000Z',
            updatedAt: '2026-06-20T00:00:00.000Z',
          },
          {
            id: 'not-required',
            reference: 'RGS2-B01-20260601',
            line: 'RGS2',
            breedingCageId: 'rgs2-b-1',
            breedingCageLabel: '1',
            dob: '2026-06-01',
            pupCount: 5,
            genotypeRequired: false,
            parents: [
              { sex: 'Male', genotype: 'WT', dob: '2026-03-11' },
              { sex: 'Female', genotype: 'WT', dob: '2026-03-11' },
            ],
            pups: [],
            attachmentIds: [],
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ],
      },
    }))
    render(<App />)

    fireEvent.click(screen.getByText('Record genotype').closest('button')!)

    expect(screen.getByText('RGS2-B07-20260620')).toBeInTheDocument()
    expect(screen.getByText('RGS2-B01-20260601')).toBeInTheDocument()
  })

  it('shows account registration and TU Lab access requests for internal beta', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Account' }))

    expect(screen.getAllByText(/TU Lab/).length).toBeGreaterThan(0)
    expect(screen.getByText('Production connections')).toBeInTheDocument()
    expect(screen.getByText('Google OAuth')).toBeInTheDocument()
    expect(screen.getByText('Supabase database')).toBeInTheDocument()
    expect(screen.queryByText('Stripe Checkout')).not.toBeInTheDocument()
    expect(screen.queryByText('$25 / month')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Test user name'), { target: { value: 'New lab member' } })
    fireEvent.change(screen.getByLabelText('Test user Gmail'), { target: { value: 'member@gmail.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Register test user' }))
    expect(screen.getByText('Verification email queued for member@gmail.com')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Find lab workspace'), { target: { value: 'tu lab' } })

    expect(screen.getByText('TU Lab found')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Request viewer access' }))

    expect(screen.getByText('member@gmail.com')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve viewer' }))

    expect(screen.getByText('Viewer')).toBeInTheDocument()
    expect(screen.getByText('TU Lab internal users are free. Privacy is protected by email login, owner/admin approval, Row Level Security, and private evidence-photo storage.')).toBeInTheDocument()
  })

  it('removes an approved viewer from the workspace', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    fireEvent.change(screen.getByLabelText('Test user name'), { target: { value: 'TEST' } })
    fireEvent.change(screen.getByLabelText('Test user Gmail'), { target: { value: 'youxiguo0213@gmail.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Register test user' }))
    fireEvent.change(screen.getByLabelText('Find lab workspace'), { target: { value: 'tu lab' } })
    fireEvent.click(screen.getByRole('button', { name: 'Request viewer access' }))
    fireEvent.click(screen.getByRole('button', { name: 'Approve viewer' }))

    expect(screen.getByText('youxiguo0213@gmail.com')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove TEST' }))

    expect(screen.queryByText('youxiguo0213@gmail.com')).not.toBeInTheDocument()
  })

  it('builds personalized dashboard insights from imported custom fields', () => {
    localStorage.setItem('colony-ops-data-v3', JSON.stringify({
      version: 3,
      data: {
        breeding: [],
        work: [],
        litters: [],
        individual: [
          { id: 'hearing-1', line: 'Hearing Lab', cage: '1', genotype: 'WT', sex: 'Male', dob: '2026-05-01', count: 2, customFields: { 'Hearing status': 'Normal', Cohort: 'ABR baseline' } },
          { id: 'hearing-2', line: 'Hearing Lab', cage: '2', genotype: 'KO', sex: 'Female', dob: '2026-05-01', count: 1, customFields: { 'Hearing status': 'Impaired', Cohort: 'ABR baseline' } },
        ],
      },
    }))

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Hearing Lab' }))

    const insights = screen.getByRole('region', { name: 'Personalized import insights' })
    expect(insights).toBeInTheDocument()
    expect(within(insights).getByText('Hearing status')).toBeInTheDocument()
    expect(within(insights).getByText('Normal')).toBeInTheDocument()
    expect(within(insights).getByText('Impaired')).toBeInTheDocument()
    expect(screen.getByText('Imported fields')).toBeInTheDocument()
  })

  it('drills from dashboard age availability into the matching individual cages', () => {
    const youngDob = new Date()
    youngDob.setDate(youngDob.getDate() - 14)
    const youngDobIso = youngDob.toISOString().slice(0, 10)
    localStorage.setItem('colony-ops-data-v3', JSON.stringify({
      version: 3,
      data: {
        breeding: [],
        work: [],
        litters: [],
        individual: [
          { id: 'unknown-1', line: 'Check Line', cage: 'U-1', genotype: 'Unknown', sex: 'Male', dob: youngDobIso, count: 1 },
          { id: 'wt-1', line: 'Check Line', cage: 'WT-1', genotype: 'WT', sex: 'Male', dob: youngDobIso, count: 1 },
        ],
      },
    }))

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Check Line' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show <6 weeks Unknown individual cages' }))

    expect(screen.getByRole('heading', { name: 'Individual cages' })).toBeInTheDocument()
    expect(screen.getByText('Dashboard filter:')).toBeInTheDocument()
    expect(screen.getByText('<6 weeks · Unknown')).toBeInTheDocument()
    expect(screen.getByText('Cage U-1')).toBeInTheDocument()
    expect(screen.queryByText('Cage WT-1')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))

    expect(screen.getByText('Cage WT-1')).toBeInTheDocument()
  })

  it('manually adds and deletes a breeding cage with a work log record', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Breeding cages' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add breeding cage' }))

    fireEvent.change(screen.getByLabelText('Cage line'), { target: { value: 'Prex1' } })
    fireEvent.change(screen.getByLabelText('Cage number'), { target: { value: 'Manual-B99' } })
    fireEvent.change(screen.getByLabelText('Male genotype'), { target: { value: 'WT' } })
    fireEvent.change(screen.getByLabelText('Male DOB'), { target: { value: '2026-04-13' } })
    fireEvent.change(screen.getByLabelText('Female genotype'), { target: { value: 'KO' } })
    fireEvent.change(screen.getByLabelText('Female DOB'), { target: { value: '2026-04-13' } })
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Young replacement pair' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save breeding cage' }))

    expect(screen.getByText('50 cages')).toBeInTheDocument()
    expect(screen.getByText('Cage Manual-B99')).toBeInTheDocument()
    expect(screen.getByText('Young replacement pair')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete breeding cage Manual-B99' }))

    expect(screen.queryByText('Cage Manual-B99')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Work log' }))
    expect(screen.getByText('Manual cage removed')).toBeInTheDocument()
    expect(screen.getByText('Removed breeding cage Manual-B99.')).toBeInTheDocument()
  })

  it('edits breeding cage details and keeps the edit in the work log', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'RGS2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Breeding cages' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit breeding cage 5' }))

    fireEvent.change(screen.getByLabelText('Male DOB'), { target: { value: '2026-04-25' } })
    fireEvent.change(screen.getByLabelText('Pups DOB'), { target: { value: '2026-06-20' } })
    fireEvent.change(screen.getByLabelText('Pups count'), { target: { value: '2' } })
    fireEvent.click(screen.getByLabelText('Priority cage'))
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Corrected DOB and pups count.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save breeding cage' }))

    expect(screen.getByText(/Apr 25, 2026/)).toBeInTheDocument()
    expect(screen.getByText('2 pups')).toBeInTheDocument()
    expect(screen.getByText('Corrected DOB and pups count.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Work log' }))
    expect(screen.getByText('Manual cage edited')).toBeInTheDocument()
    expect(screen.getByText('Edited breeding cage 5.')).toBeInTheDocument()
  })

  it('manually adds and deletes an individual cage with mouse details', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Individual cages' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add individual cage' }))

    fireEvent.change(screen.getByLabelText('Cage line'), { target: { value: 'RGS2' } })
    fireEvent.change(screen.getByLabelText('Cage label'), { target: { value: 'Manual-I88' } })
    fireEvent.change(screen.getByLabelText('Genotype'), { target: { value: 'HET' } })
    fireEvent.change(screen.getByLabelText('Sex'), { target: { value: 'Female' } })
    fireEvent.change(screen.getByLabelText('DOB'), { target: { value: '2026-05-01' } })
    fireEvent.change(screen.getByLabelText('Count'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Mouse number map'), { target: { value: '#1 HET; #2 HET' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save individual cage' }))

    expect(screen.getByText('63 cages · 155 mice')).toBeInTheDocument()
    expect(screen.getByText('Cage Manual-I88')).toBeInTheDocument()
    expect(screen.getByText('#1 HET; #2 HET')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete individual cage Manual-I88' }))

    expect(screen.queryByText('Cage Manual-I88')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Work log' }))
    expect(screen.getByText('Manual cage removed')).toBeInTheDocument()
    expect(screen.getByText('Removed individual cage Manual-I88 with 2 mice.')).toBeInTheDocument()
  })

  it('records euthanasia with a card upload and writes it to the work log', async () => {
    render(<App />)

    fireEvent.click(screen.getByText('Euthanasia record').closest('button')!)
    const dialog = within(screen.getByRole('dialog', { name: 'Record euthanasia' }))
    fireEvent.change(dialog.getByLabelText('Line'), { target: { value: 'RGS2' } })
    fireEvent.change(dialog.getByLabelText('Number euthanized'), { target: { value: '1' } })
    fireEvent.change(dialog.getByLabelText('Reason'), { target: { value: 'Experiment completed' } })
    fireEvent.change(dialog.getByLabelText('Euthanasia card photo'), {
      target: { files: [new File(['card'], 'rgs2-card.png', { type: 'image/png' })] },
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Save euthanasia record' }))

    expect(await screen.findByText('Euthanasia')).toBeInTheDocument()
    expect(screen.getAllByText(/rgs2-card.png/).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Euthanasia archive month')).toBeInTheDocument()
  })

  it('edits individual cage details and refreshes dashboard totals', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'RGS2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Individual cages' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit individual cage 1' }))

    fireEvent.change(screen.getByLabelText('Sex'), { target: { value: 'Female' } })
    fireEvent.change(screen.getByLabelText('DOB'), { target: { value: '2026-05-15' } })
    fireEvent.change(screen.getByLabelText('Count'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Corrected sex, DOB, and count.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save individual cage' }))

    expect(screen.getByText('May 15, 2026')).toBeInTheDocument()
    expect(screen.getByText('Corrected sex, DOB, and count.')).toBeInTheDocument()
    expect(screen.getByText('12 cages · 33 mice')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    const [, individualMetric] = document.querySelectorAll<HTMLElement>('.metric')
    expect(within(individualMetric).getByText('33 mice recorded')).toBeInTheDocument()
  })
})

describe('litter workspace', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(authStorageKey, JSON.stringify({ status: 'workspace_approved', selectedWorkspaceId: 'tu-lab' }))
  })

  afterEach(() => {
    cleanup()
  })

  it('creates a litter from a breeding cage with parent snapshots and tattoo numbers', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'New litter' }))

    fireEvent.change(screen.getByLabelText('Colony line'), { target: { value: 'RGS2' } })
    fireEvent.change(screen.getByLabelText('Breeding cage'), { target: { value: 'rgs2-b-7' } })
    fireEvent.change(screen.getByLabelText('Pups DOB'), { target: { value: '2026-06-01' } })
    fireEvent.change(screen.getByLabelText('Pups count'), { target: { value: '5' } })

    expect(screen.getByText('Parent snapshots')).toBeInTheDocument()
    expect(screen.getAllByText(/Male HET · Jul 30, 2025/)[0]).toBeInTheDocument()
    expect(screen.getAllByText(/Female HET · Jul 30, 2025/)[0]).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save litter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Litters' }))

    expect(screen.getByText('RGS2-B07-20260601')).toBeInTheDocument()
    expect(screen.getByText('P4-P11: Jun 5-Jun 12')).toBeInTheDocument()
    expect(screen.getByText('P21: Jun 22, 2026')).toBeInTheDocument()
    expect(screen.getByText('#1-#5')).toBeInTheDocument()
    expect(screen.getByText('wean_attention')).toBeInTheDocument()
  })

  it('records genotype results and gel evidence without creating individual cages', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'New litter' }))
    fireEvent.change(screen.getByLabelText('Colony line'), { target: { value: 'RGS2' } })
    fireEvent.change(screen.getByLabelText('Breeding cage'), { target: { value: 'rgs2-b-7' } })
    fireEvent.change(screen.getByLabelText('Pups DOB'), { target: { value: '2026-06-01' } })
    fireEvent.change(screen.getByLabelText('Pups count'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save litter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    fireEvent.click(screen.getByText('Record genotype').closest('button')!)

    fireEvent.click(screen.getByRole('button', { name: 'RGS2-B07-20260601' }))
    expect(screen.getByText('Gel evidence and genotype results')).toBeInTheDocument()
    expect(screen.getByText('RGS2-B07-20260601')).toBeInTheDocument()
    expect(screen.getByText('Tattoo #1')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Genotype #1'), { target: { value: 'KO' } })
    fireEvent.change(screen.getByLabelText('Gel image'), {
      target: { files: [new File([new Uint8Array(12)], 'rgs2-gel.png', { type: 'image/png' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save genotype' }))

    expect(await screen.findByText('rgs2-gel.png')).toBeInTheDocument()
    expect(screen.getByText('wean_attention')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Individual cages' }))
    expect(screen.getByText('12 cages · 32 mice')).toBeInTheDocument()
  })

  it('corrects an inaccurate newborn pup count and syncs the breeding cage', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'New litter' }))
    fireEvent.change(screen.getByLabelText('Colony line'), { target: { value: 'RGS2' } })
    fireEvent.change(screen.getByLabelText('Breeding cage'), { target: { value: 'rgs2-b-7' } })
    fireEvent.change(screen.getByLabelText('Pups DOB'), { target: { value: '2026-06-01' } })
    fireEvent.change(screen.getByLabelText('Pups count'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save litter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    fireEvent.click(screen.getByText('Record genotype').closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: 'RGS2-B07-20260601' }))

    fireEvent.change(screen.getByLabelText('Correct pup count'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply count' }))
    expect(screen.getByText('Tattoo #7')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add tattoo row' }))
    expect(screen.getByText('Tattoo #8')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' }).at(-1)!)
    expect(screen.queryByText('Tattoo #8')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save genotype' }))

    await waitFor(() => expect(screen.getByText('Genotype saved')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Breeding cages' }))
    expect(screen.getAllByText('7 pups').length).toBeGreaterThan(0)
  })

  it('blocks incomplete wean transfer and creates individual cages after sex is confirmed', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'New litter' }))
    fireEvent.change(screen.getByLabelText('Colony line'), { target: { value: 'RGS2' } })
    fireEvent.change(screen.getByLabelText('Breeding cage'), { target: { value: 'rgs2-b-7' } })
    fireEvent.change(screen.getByLabelText('Pups DOB'), { target: { value: '2026-05-01' } })
    fireEvent.change(screen.getByLabelText('Pups count'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save litter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    fireEvent.click(screen.getByText('Record genotype').closest('button')!)

    fireEvent.click(screen.getByRole('button', { name: 'RGS2-B07-20260501' }))
    expect(screen.getByText('Gel evidence and genotype results')).toBeInTheDocument()
    expect(screen.getByText('RGS2-B07-20260501')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm wean transfer' }))
    expect(screen.getByText('Every living pup needs a confirmed sex.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Genotype #1'), { target: { value: 'KO' } })
    fireEvent.change(screen.getByLabelText('Sex #1'), { target: { value: 'Male' } })
    fireEvent.change(screen.getByLabelText('Genotype #2'), { target: { value: 'HET' } })
    fireEvent.change(screen.getByLabelText('Sex #2'), { target: { value: 'Male' } })
    fireEvent.change(screen.getByLabelText('Genotype #3'), { target: { value: 'WT' } })
    fireEvent.change(screen.getByLabelText('Sex #3'), { target: { value: 'Female' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save genotype' }))

    expect(await screen.findByText(/#1 KO; #2 HET/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm wean transfer' }))

    fireEvent.click(screen.getByRole('button', { name: 'Individual cages' }))
    expect(screen.getByText('14 cages · 35 mice')).toBeInTheDocument()
    expect(screen.getByText('#1 KO; #2 HET')).toBeInTheDocument()
    expect(screen.getByText('#3 WT')).toBeInTheDocument()
  })

  it('weans a large litter into capacity-safe cage groups instead of one cage per pup', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'New litter' }))
    fireEvent.change(screen.getByLabelText('Colony line'), { target: { value: 'RGS2' } })
    fireEvent.change(screen.getByLabelText('Breeding cage'), { target: { value: 'rgs2-b-7' } })
    fireEvent.change(screen.getByLabelText('Pups DOB'), { target: { value: '2026-05-01' } })
    fireEvent.change(screen.getByLabelText('Pups count'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Male pups'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Female pups'), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save litter' }))
    fireEvent.click(screen.getByRole('button', { name: 'RGS2-B07-20260501' }))

    expect(await screen.findByText(/#1 Unknown; #2 Unknown; #3 Unknown/)).toBeInTheDocument()
    expect(screen.getByText(/#4 Unknown; #5 Unknown; #6 Unknown; #7 Unknown; #8 Unknown; #9 Unknown/)).toBeInTheDocument()
    expect(screen.getByText(/#10 Unknown; #11 Unknown; #12 Unknown/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm wean transfer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Individual cages' }))

    expect(screen.getByText('#1 Unknown; #2 Unknown; #3 Unknown')).toBeInTheDocument()
    expect(screen.getByText('#4 Unknown; #5 Unknown; #6 Unknown; #7 Unknown; #8 Unknown; #9 Unknown')).toBeInTheDocument()
    expect(screen.getByText('#10 Unknown; #11 Unknown; #12 Unknown')).toBeInTheDocument()
  })
})
