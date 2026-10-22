// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authStorageKey } from './domain/authFlow'
import { storageKey } from './data/colonyRepository'
import { fixtureColonyData } from './test/fixtures'

vi.mock('./services/productionConfig', () => ({
  getProductionConfig: () => ({
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'sb_publishable_example',
    stripePriceId: '',
    appUrl: 'http://127.0.0.1:5174',
    supabaseReady: true,
    stripeReady: false,
  }),
}))

vi.mock('./services/productionAuth', () => ({
  getCurrentSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
  loadCurrentLabMemberships: vi.fn().mockResolvedValue([{
    role: 'owner',
    lab: { id: '046f2a5a-5c07-470d-bbe5-2aff8cbb0680', name: 'Yaping Tu Lab', institution: 'Yaping Tu Lab' },
  }]),
  requestLabAccess: vi.fn(),
  resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
  searchProductionLabs: vi.fn().mockResolvedValue([]),
  signInWithEmail: vi.fn().mockResolvedValue({ data: { user: { email: 'shiwei@gmail.com' } }, error: null }),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn().mockResolvedValue({ error: null }),
  signUpWithEmail: vi.fn(),
  updatePassword: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
}))

vi.mock('./data/productionColonyRepository', () => ({
  loadProductionColonyData: vi.fn().mockResolvedValue({
    breeding: [],
    individual: [],
    work: [],
    litters: [],
  }),
  saveProductionColonyChanges: vi.fn().mockImplementation(async (_labId, _base, next) => next),
  subscribeToProductionColonyData: vi.fn().mockReturnValue(() => undefined),
}))

import App from './App'
import { getCurrentSession, resetPasswordForEmail, signInWithEmail, updatePassword } from './services/productionAuth'
import {
  loadProductionColonyData,
  saveProductionColonyChanges,
  subscribeToProductionColonyData,
} from './data/productionColonyRepository'

describe('TU Lab Colony production auth', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(getCurrentSession).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(loadProductionColonyData).mockResolvedValue({
      breeding: [],
      individual: [],
      work: [],
      litters: [],
      protocols: [],
    })
    vi.mocked(saveProductionColonyChanges).mockClear()
    vi.mocked(subscribeToProductionColonyData).mockReturnValue(() => undefined)
  })

  afterEach(() => {
    cleanup()
  })

  it('lets an approved Supabase member sign in and opens the colony dashboard', async () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'shiwei@gmail.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Colony overview')).toBeInTheDocument()
    expect(signInWithEmail).toHaveBeenCalledWith('shiwei@gmail.com', 'secret-password')
    await waitFor(() => expect(loadProductionColonyData).toHaveBeenCalledWith('046f2a5a-5c07-470d-bbe5-2aff8cbb0680'))
    expect(JSON.parse(localStorage.getItem(authStorageKey) ?? '{}')).toMatchObject({
      status: 'workspace_approved',
      selectedWorkspaceId: '046f2a5a-5c07-470d-bbe5-2aff8cbb0680',
    })
  })

  it('sends a password reset link from the sign-in page', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'daniel@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByText('Check your email for a password reset link.')).toBeInTheDocument()
    expect(resetPasswordForEmail).toHaveBeenCalledWith('daniel@example.com')
  })

  it('lets a recovery-link user set a new password', async () => {
    window.history.replaceState({}, '', '/auth/reset-password')

    render(<App />)

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-secure-password' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-secure-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }))

    expect(await screen.findByText('Password updated. Sign in with your new password.')).toBeInTheDocument()
    expect(updatePassword).toHaveBeenCalledWith('new-secure-password')
    expect(window.location.pathname).toBe('/')
  })

  it('does not update a recovery password when confirmation does not match', async () => {
    window.history.replaceState({}, '', '/auth/reset-password')

    render(<App />)

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-secure-password' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }))

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    expect(updatePassword).not.toHaveBeenCalled()
  })

  it('automatically replaces stale browser cache with the cloud snapshot', async () => {
    const labId = '046f2a5a-5c07-470d-bbe5-2aff8cbb0680'
    const staleLocalData = {
      ...fixtureColonyData,
      breeding: [{ ...fixtureColonyData.breeding[0], line: 'Stale local line' }],
    }
    const cloudData = {
      ...fixtureColonyData,
      breeding: [{ ...fixtureColonyData.breeding[0], line: 'Cloud RGS2' }],
    }
    localStorage.setItem(authStorageKey, JSON.stringify({ status: 'workspace_approved', selectedWorkspaceId: labId }))
    localStorage.setItem(storageKey, JSON.stringify({ version: 3, data: staleLocalData }))
    vi.mocked(loadProductionColonyData).mockResolvedValue(cloudData)

    render(<App />)

    expect(await screen.findAllByText('Cloud RGS2')).not.toHaveLength(0)
    expect(screen.queryByText('Stale local line')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Choose colony data version' })).not.toBeInTheDocument()
    expect(saveProductionColonyChanges).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '{}')).toMatchObject({ data: cloudData })
  })

  it('reloads the cloud snapshot when an open browser window regains focus', async () => {
    const labId = '046f2a5a-5c07-470d-bbe5-2aff8cbb0680'
    const initialCloudData = {
      ...fixtureColonyData,
      breeding: [{ ...fixtureColonyData.breeding[0], line: 'Initial cloud line' }],
    }
    const refreshedCloudData = {
      ...fixtureColonyData,
      breeding: [{ ...fixtureColonyData.breeding[0], line: 'Focus refreshed line' }],
    }
    localStorage.setItem(authStorageKey, JSON.stringify({ status: 'workspace_approved', selectedWorkspaceId: labId }))
    vi.mocked(loadProductionColonyData)
      .mockResolvedValueOnce(initialCloudData)
      .mockResolvedValue(refreshedCloudData)

    render(<App />)

    expect(await screen.findAllByText('Initial cloud line')).not.toHaveLength(0)
    window.dispatchEvent(new Event('focus'))

    expect(await screen.findAllByText('Focus refreshed line')).not.toHaveLength(0)
    expect(screen.queryByText('Initial cloud line')).not.toBeInTheDocument()
  })

  it('polls the cloud so another device update appears without a manual refresh', async () => {
    const labId = '046f2a5a-5c07-470d-bbe5-2aff8cbb0680'
    const initialCloudData = {
      ...fixtureColonyData,
      breeding: [{ ...fixtureColonyData.breeding[0], line: 'Before phone update' }],
    }
    const refreshedCloudData = {
      ...fixtureColonyData,
      breeding: [{ ...fixtureColonyData.breeding[0], line: 'After phone update' }],
    }
    const setIntervalSpy = vi.spyOn(window, 'setInterval')
    localStorage.setItem(authStorageKey, JSON.stringify({ status: 'workspace_approved', selectedWorkspaceId: labId }))
    vi.mocked(loadProductionColonyData)
      .mockResolvedValueOnce(initialCloudData)
      .mockResolvedValue(refreshedCloudData)

    render(<App />)

    expect(await screen.findAllByText('Before phone update')).not.toHaveLength(0)
    const refreshCall = setIntervalSpy.mock.calls.filter(([, delay]) => delay === 15_000).at(-1)
    expect(refreshCall).toBeDefined()
    await act(async () => {
      await (refreshCall?.[0] as () => Promise<void> | void)()
    })
    expect(await screen.findAllByText('After phone update')).not.toHaveLength(0)
    setIntervalSpy.mockRestore()
  })

  it('applies another device update as soon as the cloud publishes it', async () => {
    const labId = '046f2a5a-5c07-470d-bbe5-2aff8cbb0680'
    const initialCloudData = {
      ...fixtureColonyData,
      breeding: [{ ...fixtureColonyData.breeding[0], line: 'Before phone update' }],
    }
    const phoneCloudData = {
      ...fixtureColonyData,
      breeding: [{ ...fixtureColonyData.breeding[0], line: 'Live phone update' }],
    }
    localStorage.setItem(authStorageKey, JSON.stringify({ status: 'workspace_approved', selectedWorkspaceId: labId }))
    vi.mocked(loadProductionColonyData).mockResolvedValue(initialCloudData)

    render(<App />)

    expect(await screen.findAllByText('Before phone update')).not.toHaveLength(0)
    const onCloudData = vi.mocked(subscribeToProductionColonyData).mock.calls.at(-1)?.[1]
    expect(onCloudData).toBeDefined()
    act(() => onCloudData?.(phoneCloudData))

    expect(await screen.findAllByText('Live phone update')).not.toHaveLength(0)
    expect(screen.queryByText('Before phone update')).not.toBeInTheDocument()
  })

  it('does not let an older refresh overwrite a newer live device update', async () => {
    const labId = '046f2a5a-5c07-470d-bbe5-2aff8cbb0680'
    const initialCloudData = {
      ...fixtureColonyData,
      breeding: [{ ...fixtureColonyData.breeding[0], line: 'Initial cloud line' }],
    }
    const staleRefreshData = {
      ...fixtureColonyData,
      breeding: [{ ...fixtureColonyData.breeding[0], line: 'Stale refresh line' }],
    }
    const livePhoneData = {
      ...fixtureColonyData,
      breeding: [{ ...fixtureColonyData.breeding[0], line: 'Newest phone line' }],
    }
    let finishRefresh: ((value: typeof staleRefreshData) => void) | undefined
    localStorage.setItem(authStorageKey, JSON.stringify({ status: 'workspace_approved', selectedWorkspaceId: labId }))
    vi.mocked(loadProductionColonyData)
      .mockResolvedValueOnce(initialCloudData)
      .mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve }))

    render(<App />)

    expect(await screen.findAllByText('Initial cloud line')).not.toHaveLength(0)
    act(() => window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(finishRefresh).toBeDefined())

    const onCloudData = vi.mocked(subscribeToProductionColonyData).mock.calls.at(-1)?.[1]
    act(() => onCloudData?.(livePhoneData))
    expect(await screen.findAllByText('Newest phone line')).not.toHaveLength(0)

    await act(async () => finishRefresh?.(staleRefreshData))

    expect(screen.queryByText('Stale refresh line')).not.toBeInTheDocument()
    expect(screen.getAllByText('Newest phone line')).not.toHaveLength(0)
  })

  it('saves edits silently without asking members about cloud state', async () => {
    const labId = '046f2a5a-5c07-470d-bbe5-2aff8cbb0680'
    let finishSave: (() => void) | undefined
    localStorage.setItem(authStorageKey, JSON.stringify({ status: 'workspace_approved', selectedWorkspaceId: labId }))
    vi.mocked(loadProductionColonyData).mockResolvedValue(fixtureColonyData)
    vi.mocked(saveProductionColonyChanges).mockImplementationOnce((_labId, _base, next) => new Promise((resolve) => {
      finishSave = () => resolve(next)
    }))

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Manage RGS2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive colony' }))
    expect(screen.queryByText('Saving...')).not.toBeInTheDocument()

    finishSave?.()
    await waitFor(() => expect(saveProductionColonyChanges).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('serializes rapid edits so an older snapshot cannot overwrite a newer one', async () => {
    const labId = '046f2a5a-5c07-470d-bbe5-2aff8cbb0680'
    let finishFirstSave: (() => void) | undefined
    localStorage.setItem(authStorageKey, JSON.stringify({ status: 'workspace_approved', selectedWorkspaceId: labId }))
    vi.mocked(loadProductionColonyData).mockResolvedValue(fixtureColonyData)
    vi.mocked(saveProductionColonyChanges)
      .mockImplementationOnce((_labId, _base, next) => new Promise((resolve) => {
        finishFirstSave = () => resolve(next)
      }))
      .mockImplementationOnce(async (_labId, _base, next) => next)

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Manage RGS2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive colony' }))
    await waitFor(() => expect(saveProductionColonyChanges).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Restore RGS2' }))
    expect(saveProductionColonyChanges).toHaveBeenCalledTimes(1)

    finishFirstSave?.()
    await waitFor(() => expect(saveProductionColonyChanges).toHaveBeenCalledTimes(2))
  })

  it('does not write stale browser cache to the cloud when the refresh session is missing', async () => {
    const labId = '046f2a5a-5c07-470d-bbe5-2aff8cbb0680'
    localStorage.setItem(authStorageKey, JSON.stringify({ status: 'workspace_approved', selectedWorkspaceId: labId }))
    localStorage.setItem(storageKey, JSON.stringify({ version: 3, data: fixtureColonyData }))
    vi.mocked(getCurrentSession).mockResolvedValue(null)

    render(<App />)

    expect(await screen.findByText('Cloud session expired. Please sign in again to sync latest colony data.')).toBeInTheDocument()
    expect(screen.queryByText(/choose whether to upload/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }))
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '{}')).toMatchObject({ data: fixtureColonyData })
    await waitFor(() => {
      expect(loadProductionColonyData).not.toHaveBeenCalled()
      expect(saveProductionColonyChanges).not.toHaveBeenCalled()
    })
  })
})
