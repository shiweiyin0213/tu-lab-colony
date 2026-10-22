export type AuthFlowStatus =
  | 'visitor'
  | 'tour'
  | 'registered_unverified'
  | 'email_verified'
  | 'lab_search'
  | 'lab_access_pending'
  | 'workspace_approved'

export interface AuthFlowUser {
  name: string
  email: string
  emailVerified: boolean
}

export interface LabDirectoryEntry {
  id: string
  name: string
  institution: string
}

export interface AuthSessionState {
  status: AuthFlowStatus
  user?: AuthFlowUser
  selectedWorkspaceId?: string
  pendingWorkspaceName?: string
}

export const authStorageKey = 'vivatrace-auth-state-v1'

export const labDirectory: LabDirectoryEntry[] = [
  { id: 'tu-lab', name: 'Yaping Tu Lab', institution: 'TU Lab workspace' },
]

export function createInitialAuthState(): AuthSessionState {
  return { status: 'visitor' }
}

export function startTour(state: AuthSessionState): AuthSessionState {
  return { ...state, status: 'tour' }
}

export function registerAuthUser(state: AuthSessionState, name: string, email: string): AuthSessionState {
  return {
    ...state,
    status: 'registered_unverified',
    user: { name: name.trim(), email: email.trim().toLowerCase(), emailVerified: false },
  }
}

export function markEmailVerified(state: AuthSessionState): AuthSessionState {
  if (!state.user) return state
  return {
    ...state,
    status: 'lab_search',
    user: { ...state.user, emailVerified: true },
  }
}

export function searchLabDirectory(query: string): LabDirectoryEntry[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []
  return labDirectory.filter((lab) => `${lab.name} ${lab.institution}`.toLowerCase().includes(normalized))
}

export function createLabAccessRequest(state: AuthSessionState, workspaceId: string): AuthSessionState {
  const workspace = labDirectory.find((lab) => lab.id === workspaceId)
  return {
    ...state,
    status: 'lab_access_pending',
    selectedWorkspaceId: workspaceId,
    pendingWorkspaceName: workspace?.name ?? 'Selected lab',
  }
}

export function approveWorkspaceAccess(state: AuthSessionState): AuthSessionState {
  return { ...state, status: 'workspace_approved' }
}

export function canViewColonyData(state: AuthSessionState): boolean {
  return state.status === 'workspace_approved'
}

export function loadAuthState(): AuthSessionState {
  try {
    const raw = localStorage.getItem(authStorageKey)
    return raw ? JSON.parse(raw) as AuthSessionState : createInitialAuthState()
  } catch {
    return createInitialAuthState()
  }
}

export function saveAuthState(state: AuthSessionState) {
  localStorage.setItem(authStorageKey, JSON.stringify(state))
}
