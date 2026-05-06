import { supabase } from '@/lib/supabase';

export interface Assignment {
  id: string;
  company_id: string;
  user_id: string;
  location_id: string;
  access_type: 'permanent' | 'temporary';
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface EmployeeWithAssignments {
  user_id: string;
  role: 'admin' | 'employee';
  assignments: Assignment[];
}

export async function listAssignments(companyId: string): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from('employee_location_assignments')
    .select('id, company_id, user_id, location_id, access_type, expires_at, created_by, created_at')
    .eq('company_id', companyId);
  if (error) throw error;
  return (data ?? []) as Assignment[];
}

export async function getMyAssignedLocationIds(): Promise<string[]> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return [];
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('employee_location_assignments')
    .select('location_id, expires_at')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? [])
    .filter((r) => r.expires_at == null || r.expires_at > nowIso)
    .map((r) => r.location_id);
}

export async function listAssignmentsForUser(userId: string): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from('employee_location_assignments')
    .select('id, company_id, user_id, location_id, access_type, expires_at, created_by, created_at')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as Assignment[];
}

export async function assignEmployeeToLocation(params: {
  companyId: string;
  userId: string;
  locationId: string;
}): Promise<Assignment> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('employee_location_assignments')
    .insert({
      company_id: params.companyId,
      user_id: params.userId,
      location_id: params.locationId,
      access_type: 'permanent',
      created_by: auth.user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Assignment;
}

export async function unassignEmployeeFromLocation(params: {
  userId: string;
  locationId: string;
}): Promise<void> {
  const { error } = await supabase
    .from('employee_location_assignments')
    .delete()
    .eq('user_id', params.userId)
    .eq('location_id', params.locationId);
  if (error) throw error;
}

export async function listEmployeesWithAssignments(
  companyId: string,
): Promise<EmployeeWithAssignments[]> {
  const { data: members, error: membersError } = await supabase
    .from('company_members')
    .select('user_id, role')
    .eq('company_id', companyId);
  if (membersError) throw membersError;

  const employees = (members ?? []).filter(
    (m): m is { user_id: string; role: 'employee' } => m.role === 'employee',
  );
  if (employees.length === 0) return [];

  const assignments = await listAssignments(companyId);
  const byUser = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const list = byUser.get(a.user_id) ?? [];
    list.push(a);
    byUser.set(a.user_id, list);
  }

  return employees.map((m) => ({
    user_id: m.user_id,
    role: 'employee',
    assignments: byUser.get(m.user_id) ?? [],
  }));
}
