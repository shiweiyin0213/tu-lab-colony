import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadCurrentLabMemberships,
  requestLabAccess,
  resetPasswordForEmail,
  searchProductionLabs,
  signInWithEmail,
  updatePassword,
} from './productionAuth'
import { requireSupabase } from './supabaseClient'

vi.mock('./supabaseClient', () => ({
  requireSupabase: vi.fn(),
}))

vi.mock('./productionConfig', () => ({
  getProductionConfig: () => ({ appUrl: 'https://colony.example.com' }),
}))

const mockedRequireSupabase = vi.mocked(requireSupabase)

describe('productionAuth', () => {
  beforeEach(() => {
    mockedRequireSupabase.mockReset()
  })

  it('searches lab workspaces from Supabase by name and institution', async () => {
    const or = vi.fn().mockResolvedValue({
      data: [{ id: 'lab-1', name: 'Yaping Tu Lab', institution: 'Yaping Tu Lab' }],
      error: null,
    })
    const select = vi.fn(() => ({ or }))
    const from = vi.fn(() => ({ select }))
    mockedRequireSupabase.mockReturnValue({ from } as never)

    const labs = await searchProductionLabs('tu lab')

    expect(from).toHaveBeenCalledWith('labs')
    expect(select).toHaveBeenCalledWith('id,name,institution')
    expect(or).toHaveBeenCalledWith('name.ilike.%tu lab%,institution.ilike.%tu lab%')
    expect(labs).toEqual([{ id: 'lab-1', name: 'Yaping Tu Lab', institution: 'Yaping Tu Lab' }])
  })

  it('signs in an existing user with email and password', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ data: { user: { email: 'shiwei@gmail.com' } }, error: null })
    mockedRequireSupabase.mockReturnValue({ auth: { signInWithPassword } } as never)

    const result = await signInWithEmail('shiwei@gmail.com', 'secret-password')

    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'shiwei@gmail.com', password: 'secret-password' })
    expect(result.error).toBeNull()
  })

  it('sends password recovery email back to the app reset page', async () => {
    const resetPasswordForEmailCall = vi.fn().mockResolvedValue({ data: {}, error: null })
    mockedRequireSupabase.mockReturnValue({ auth: { resetPasswordForEmail: resetPasswordForEmailCall } } as never)

    const result = await resetPasswordForEmail('daniel@example.com')

    expect(resetPasswordForEmailCall).toHaveBeenCalledWith('daniel@example.com', {
      redirectTo: 'https://colony.example.com/auth/reset-password',
    })
    expect(result.error).toBeNull()
  })

  it('updates the signed-in recovery user password', async () => {
    const updateUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockedRequireSupabase.mockReturnValue({ auth: { updateUser } } as never)

    const result = await updatePassword('new-secure-password')

    expect(updateUser).toHaveBeenCalledWith({ password: 'new-secure-password' })
    expect(result.error).toBeNull()
  })

  it('loads approved lab memberships for the signed-in user', async () => {
    const select = vi.fn().mockResolvedValue({
      data: [{
        role: 'owner',
        labs: { id: 'lab-1', name: 'Yaping Tu Lab', institution: 'Yaping Tu Lab' },
      }],
      error: null,
    })
    const from = vi.fn(() => ({ select }))
    mockedRequireSupabase.mockReturnValue({ from } as never)

    const memberships = await loadCurrentLabMemberships()

    expect(from).toHaveBeenCalledWith('lab_members')
    expect(select).toHaveBeenCalledWith('role,labs(id,name,institution)')
    expect(memberships).toEqual([{
      role: 'owner',
      lab: { id: 'lab-1', name: 'Yaping Tu Lab', institution: 'Yaping Tu Lab' },
    }])
  })

  it('reuses an existing pending lab request instead of inserting a duplicate', async () => {
    const pendingRequest = { id: 'request-1', lab_id: 'lab-1', user_id: 'user-1', status: 'pending' }
    const maybeSingle = vi.fn().mockResolvedValue({ data: pendingRequest, error: null })
    const pendingQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle,
    }
    pendingQuery.select.mockReturnValue(pendingQuery)
    pendingQuery.eq.mockReturnValue(pendingQuery)
    const insert = vi.fn()
    const from = vi.fn(() => ({ ...pendingQuery, insert }))
    mockedRequireSupabase.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from,
    } as never)

    const result = await requestLabAccess({ labId: 'lab-1' })

    expect(result).toEqual({ data: pendingRequest, error: null })
    expect(pendingQuery.eq).toHaveBeenNthCalledWith(1, 'lab_id', 'lab-1')
    expect(pendingQuery.eq).toHaveBeenNthCalledWith(2, 'user_id', 'user-1')
    expect(pendingQuery.eq).toHaveBeenNthCalledWith(3, 'status', 'pending')
    expect(insert).not.toHaveBeenCalled()
  })
})
