import { supabase } from '@/lib/supabase';
import { assignEmployeeToLocation } from '@/services/assignments';

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface AccessRequest {
  id: string;
  company_id: string;
  user_id: string;
  location_id: string;
  reason: string | null;
  status: AccessRequestStatus;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

const COLS =
  'id, company_id, user_id, location_id, reason, status, decided_by, decided_at, created_at';

export interface RequestableLocation {
  id: string;
  name: string;
  address: string | null;
}

export async function listRequestableLocations(): Promise<RequestableLocation[]> {
  const { data, error } = await supabase.rpc('list_requestable_locations');
  if (error) throw error;
  return (data ?? []) as RequestableLocation[];
}

export async function createAccessRequest(
  locationId: string,
  reason?: string,
): Promise<AccessRequest> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Not authenticated');

  const { data: loc, error: locErr } = await supabase
    .from('locations')
    .select('company_id')
    .eq('id', locationId)
    .single();
  if (locErr) throw locErr;

  const { data, error } = await supabase
    .from('location_access_requests')
    .insert({
      company_id: loc.company_id,
      user_id: userId,
      location_id: locationId,
      reason: reason?.trim() ? reason.trim() : null,
    })
    .select(COLS)
    .single();
  if (error) throw error;
  return data as AccessRequest;
}

export async function listMyAccessRequests(): Promise<AccessRequest[]> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from('location_access_requests')
    .select(COLS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AccessRequest[];
}

export async function listPendingAccessRequests(
  companyId: string,
): Promise<AccessRequest[]> {
  const { data, error } = await supabase
    .from('location_access_requests')
    .select(COLS)
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AccessRequest[];
}

export async function approveAccessRequest(requestId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const adminId = auth.user?.id ?? null;

  const { data: req, error: reqErr } = await supabase
    .from('location_access_requests')
    .select(COLS)
    .eq('id', requestId)
    .single();
  if (reqErr) throw reqErr;
  const r = req as AccessRequest;

  const { data: existing, error: existErr } = await supabase
    .from('employee_location_assignments')
    .select('id')
    .eq('user_id', r.user_id)
    .eq('location_id', r.location_id)
    .limit(1);
  if (existErr) throw existErr;

  if ((existing?.length ?? 0) === 0) {
    await assignEmployeeToLocation({
      companyId: r.company_id,
      userId: r.user_id,
      locationId: r.location_id,
    });
  }

  const { error: updErr } = await supabase
    .from('location_access_requests')
    .update({
      status: 'approved',
      decided_by: adminId,
      decided_at: new Date().toISOString(),
    })
    .eq('id', requestId);
  if (updErr) throw updErr;
}

export async function rejectAccessRequest(requestId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const adminId = auth.user?.id ?? null;
  const { error } = await supabase
    .from('location_access_requests')
    .update({
      status: 'rejected',
      decided_by: adminId,
      decided_at: new Date().toISOString(),
    })
    .eq('id', requestId);
  if (error) throw error;
}
