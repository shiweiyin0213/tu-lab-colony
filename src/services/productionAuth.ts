import { getProductionConfig } from './productionConfig'
import { requireSupabase } from './supabaseClient'

export type LabRole = 'owner' | 'admin' | 'viewer'

export interface JoinLabRequestInput {
  labId: string
  requestedRole?: LabRole
}

export interface ProductionLab {
  id: string
  name: string
  institution: string
}

export interface ProductionLabMembership {
  role: LabRole
  lab: ProductionLab
}

export async function signUpWithEmail(email: string, password: string, fullName: string) {
  return requireSupabase().auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${getProductionConfig().appUrl}/auth/callback`,
    },
  })
}

export async function signInWithEmail(email: string, password: string) {
  return requireSupabase().auth.signInWithPassword({ email, password })
}

export async function resetPasswordForEmail(email: string) {
  return requireSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: `${getProductionConfig().appUrl}/auth/reset-password`,
  })
}

export async function updatePassword(password: string) {
  return requireSupabase().auth.updateUser({ password })
}

export async function getCurrentSession() {
  const { data, error } = await requireSupabase().auth.getSession()
  if (error) throw error
  return data.session
}

export async function searchProductionLabs(query: string): Promise<ProductionLab[]> {
  const normalized = query.trim()
  if (!normalized) return []

  const { data, error } = await requireSupabase()
    .from('labs')
    .select('id,name,institution')
    .or(`name.ilike.%${normalized}%,institution.ilike.%${normalized}%`)

  if (error) throw error
  return (data ?? []).map((lab) => ({
    id: lab.id,
    name: lab.name,
    institution: lab.institution ?? '',
  }))
}

export async function loadCurrentLabMemberships(): Promise<ProductionLabMembership[]> {
  const { data, error } = await requireSupabase()
    .from('lab_members')
    .select('role,labs(id,name,institution)')

  if (error) throw error
  return (data ?? []).map((membership) => {
    const lab = Array.isArray(membership.labs) ? membership.labs[0] : membership.labs
    return {
      role: membership.role as LabRole,
      lab: {
        id: lab.id,
        name: lab.name,
        institution: lab.institution ?? '',
      },
    }
  })
}

export async function signInWithGoogle() {
  return requireSupabase().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${getProductionConfig().appUrl}/auth/callback`,
    },
  })
}

export async function signOut() {
  return requireSupabase().auth.signOut()
}

export async function requestLabAccess({ labId, requestedRole = 'viewer' }: JoinLabRequestInput) {
  const supabase = requireSupabase()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) return { data: null, error: userError }
  if (!user) return { data: null, error: new Error('No signed-in user') }

  const findPendingRequest = () => supabase
    .from('lab_join_requests')
    .select()
    .eq('lab_id', labId)
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()

  const pending = await findPendingRequest()
  if (pending.error) return pending
  if (pending.data) return pending

  const created = await supabase.from('lab_join_requests').insert({
    lab_id: labId,
    user_id: user.id,
    requested_role: requestedRole,
    status: 'pending',
  }).select().single()

  // A second tab may submit between the lookup and insert. Reuse the request
  // that won the race instead of leaving the member on a generic error page.
  if (created.error?.code === '23505') return findPendingRequest()
  return created
}

export async function approveLabAccess(requestId: string) {
  const supabase = requireSupabase()
  return supabase.rpc('approve_lab_join_request', { request_id: requestId })
}

export async function uploadEvidencePhoto(file: File, folder: 'gel' | 'euthanasia-card', recordId: string) {
  const path = `${folder}/${recordId}/${Date.now()}-${file.name}`
  const { data, error } = await requireSupabase()
    .storage
    .from('evidence')
    .upload(path, file, { cacheControl: '3600', upsert: false })

  return { data, error, path }
}
