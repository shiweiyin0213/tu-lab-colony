import { describe, expect, it } from 'vitest'
import {
  canViewColonyData,
  createInitialAuthState,
  createLabAccessRequest,
  markEmailVerified,
  registerAuthUser,
  searchLabDirectory,
} from './authFlow'

describe('authFlow', () => {
  it('hides colony data for visitors and pending users', () => {
    expect(canViewColonyData(createInitialAuthState())).toBe(false)

    const registered = registerAuthUser(createInitialAuthState(), 'Lab Member', 'member@example.com')
    const verified = markEmailVerified(registered)
    const pending = createLabAccessRequest(verified, 'tu-lab')

    expect(canViewColonyData(pending)).toBe(false)
    expect(canViewColonyData({ ...pending, status: 'workspace_approved' })).toBe(true)
  })

  it('continues verified beta users directly to lab search', () => {
    const state = registerAuthUser(createInitialAuthState(), 'Lab Member', 'member@example.com')
    const verified = markEmailVerified(state)

    expect(verified.status).toBe('lab_search')
    expect(verified).not.toHaveProperty('billing')
  })

  it('finds Yaping Tu Lab from common search terms', () => {
    expect(searchLabDirectory('tu').map((lab) => lab.name)).toContain('Yaping Tu Lab')
    expect(searchLabDirectory('yaping tu').map((lab) => lab.id)).toEqual(['tu-lab'])
    expect(searchLabDirectory('unknown lab')).toEqual([])
  })
})
