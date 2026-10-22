export type WorkspaceRole = 'Owner' | 'Admin' | 'Viewer'
export type AccessRequestStatus = 'Pending' | 'Approved' | 'Denied'
export type ConnectionStatus = 'Ready' | 'Missing config'

export interface AccountUser {
  id: string
  name: string
  email: string
  defaultRole: WorkspaceRole
}

export interface WorkspaceMember {
  id: string
  name: string
  email: string
  role: WorkspaceRole
}

export interface AccessRequest {
  id: string
  userId: string
  name: string
  email: string
  requestedRole: WorkspaceRole
  status: AccessRequestStatus
}

export interface LabWorkspace {
  id: string
  name: string
  ownerEmail: string
  members: WorkspaceMember[]
  requests: AccessRequest[]
}

export interface ProductionConnectionConfig {
  googleClientId?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
  stripePriceId?: string
}

export interface ProductionConnection {
  id: 'google-oauth' | 'supabase'
  label: string
  status: ConnectionStatus
  detail: string
}

export function registerUser(name: string, email: string): AccountUser {
  return {
    id: stableId(email),
    name,
    email: email.trim().toLowerCase(),
    defaultRole: 'Viewer',
  }
}

export function createOwnerWorkspace(ownerEmail: string, ownerName: string, nowIso: string): LabWorkspace {
  void nowIso
  return createLabWorkspace('TU Lab', ownerEmail, ownerName, nowIso, 'tu-lab')
}

export function createLabWorkspace(
  name: string,
  ownerEmail: string,
  ownerName: string,
  nowIso: string,
  workspaceId = stableId(name),
): LabWorkspace {
  void nowIso
  const owner = registerUser(ownerName, ownerEmail)
  return {
    id: workspaceId,
    name: name.trim(),
    ownerEmail: owner.email,
    members: [{ id: owner.id, name: owner.name, email: owner.email, role: 'Owner' }],
    requests: [],
  }
}

export function searchWorkspaces(workspaces: LabWorkspace[], query: string) {
  const normalized = query.trim().toLowerCase()
  return workspaces.filter((workspace) => workspace.name.toLowerCase().includes(normalized))
}

export function requestAccess(workspace: LabWorkspace, user: AccountUser): LabWorkspace {
  const existing = workspace.requests.find((request) => request.email === user.email)
  if (existing) return workspace

  return {
    ...workspace,
    requests: [
      ...workspace.requests,
      {
        id: `request-${user.id}`,
        userId: user.id,
        name: user.name,
        email: user.email,
        requestedRole: 'Viewer',
        status: 'Pending',
      },
    ],
  }
}

export function approveAccessRequest(workspace: LabWorkspace, requestId: string, approverEmail: string): LabWorkspace {
  const approver = workspace.members.find((member) => member.email === approverEmail.toLowerCase())
  if (!approver || (approver.role !== 'Owner' && approver.role !== 'Admin')) return workspace

  const request = workspace.requests.find((item) => item.id === requestId && item.status === 'Pending')
  if (!request) return workspace

  return {
    ...workspace,
    members: [
      ...workspace.members,
      {
        id: request.userId,
        name: request.name,
        email: request.email,
        role: request.requestedRole,
      },
    ],
    requests: workspace.requests.map((item) => item.id === requestId ? { ...item, status: 'Approved' } : item),
  }
}

export function removeWorkspaceMember(workspace: LabWorkspace, memberId: string, actorEmail: string): LabWorkspace {
  const actor = workspace.members.find((member) => member.email === actorEmail.toLowerCase())
  const target = workspace.members.find((member) => member.id === memberId)
  if (!actor || !target || (actor.role !== 'Owner' && actor.role !== 'Admin') || target.role === 'Owner') return workspace

  return {
    ...workspace,
    members: workspace.members.filter((member) => member.id !== memberId),
    requests: workspace.requests.filter((request) => request.userId !== memberId),
  }
}

export function getProductionConnections(config: ProductionConnectionConfig): ProductionConnection[] {
  return [
    {
      id: 'google-oauth',
      label: 'Google OAuth',
      status: config.googleClientId ? 'Ready' : 'Missing config',
      detail: config.googleClientId ? 'Can use Google sign-in for lab accounts.' : 'Needs VITE_GOOGLE_CLIENT_ID.',
    },
    {
      id: 'supabase',
      label: 'Supabase database',
      status: config.supabaseUrl && config.supabaseAnonKey ? 'Ready' : 'Missing config',
      detail: config.supabaseUrl && config.supabaseAnonKey ? 'Can persist shared colony data online.' : 'Needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    },
  ]
}

function stableId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
