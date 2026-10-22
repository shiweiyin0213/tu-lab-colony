import { describe, expect, it } from 'vitest'
import {
  approveAccessRequest,
  createLabWorkspace,
  createOwnerWorkspace,
  getProductionConnections,
  registerUser,
  removeWorkspaceMember,
  requestAccess,
  searchWorkspaces,
} from './account'

describe('account and workspace access', () => {
  it('lets a new viewer find TU Lab and request access', () => {
    const workspace = createOwnerWorkspace('shiwei@gmail.com', 'Shiwei Yin', '2026-06-20')
    const newUser = registerUser('New lab member', 'member@gmail.com')

    expect(newUser.defaultRole).toBe('Viewer')
    expect(searchWorkspaces([workspace], 'tu lab')).toEqual([workspace])

    const requested = requestAccess(workspace, newUser)

    expect(requested.requests).toMatchObject([
      {
        email: 'member@gmail.com',
        name: 'New lab member',
        requestedRole: 'Viewer',
        status: 'Pending',
      },
    ])
  })

  it('approves pending access as viewer by default', () => {
    const workspace = createOwnerWorkspace('shiwei@gmail.com', 'Shiwei Yin', '2026-06-20')
    const newUser = registerUser('New lab member', 'member@gmail.com')
    const requested = requestAccess(workspace, newUser)

    const approved = approveAccessRequest(requested, requested.requests[0].id, 'shiwei@gmail.com')

    expect(approved.members).toMatchObject([
      { email: 'shiwei@gmail.com', role: 'Owner' },
      { email: 'member@gmail.com', role: 'Viewer' },
    ])
    expect(approved.requests[0].status).toBe('Approved')
  })

  it('keeps TU Lab workspace free of billing state', () => {
    const workspace = createOwnerWorkspace('shiwei@gmail.com', 'Shiwei Yin', '2026-06-20')

    expect(workspace).not.toHaveProperty('billing')
  })

  it('creates a new owner lab workspace', () => {
    const workspace = createLabWorkspace('My New Lab', 'pi@example.com', 'PI Name', '2026-06-20')

    expect(workspace).toMatchObject({
      id: 'my-new-lab',
      name: 'My New Lab',
      ownerEmail: 'pi@example.com',
    })
    expect(workspace.members).toEqual([{ id: 'pi-example-com', name: 'PI Name', email: 'pi@example.com', role: 'Owner' }])
  })

  it('removes a viewer without removing the owner account', () => {
    const workspace = createOwnerWorkspace('shiwei@gmail.com', 'Shiwei Yin', '2026-06-20')
    const newUser = registerUser('TEST', 'youxiguo0213@gmail.com')
    const requested = requestAccess(workspace, newUser)
    const approved = approveAccessRequest(requested, requested.requests[0].id, 'shiwei@gmail.com')

    const removed = removeWorkspaceMember(approved, newUser.id, 'shiwei@gmail.com')

    expect(removed.members).toEqual([{ id: 'shiwei-gmail-com', name: 'Shiwei Yin', email: 'shiwei@gmail.com', role: 'Owner' }])
  })

  it('describes production service readiness from environment configuration', () => {
    const connections = getProductionConnections({
      googleClientId: 'google-client',
      supabaseUrl: '',
      supabaseAnonKey: '',
    })

    expect(connections).toMatchObject([
      { id: 'google-oauth', status: 'Ready' },
      { id: 'supabase', status: 'Missing config' },
    ])
  })
})
