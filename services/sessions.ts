import { supabase } from '@/lib/supabase';

export type SessionStatus = 'active' | 'completed';

export interface Session {
  id: string;
  location_id: string;
  created_at: string;
  status: SessionStatus;
  created_by: string | null;
}

export interface CountRow {
  id: string;
  session_id: string;
  product_id: string;
  quantity: number;
  updated_by: string;
  updated_at: string;
}

export async function hasActiveSession(locationId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('inventory_sessions')
    .select('id')
    .eq('location_id', locationId)
    .eq('status', 'active')
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

export async function getSessions(locationId: string): Promise<Session[]> {
  const { data, error } = await supabase
    .from('inventory_sessions')
    .select('id, location_id, created_at, status, created_by')
    .eq('location_id', locationId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Session[];
}

export async function createSession(locationId: string): Promise<Session> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('inventory_sessions')
    .insert({ location_id: locationId, status: 'active', created_by: user?.id ?? null })
    .select()
    .single();
  if (error) {
    throw new Error(`Session creation failed: ${error.message} (code: ${error.code})`);
  }
  return data as Session;
}

export async function completeSession(sessionId: string): Promise<void> {
  // Step 1: mark session completed first — even if quantity propagation fails,
  // the session must be closed.
  const { error: statusError } = await supabase
    .from('inventory_sessions')
    .update({ status: 'completed' })
    .eq('id', sessionId);
  if (statusError) throw statusError;

  // Step 2: fetch all counts for this session.
  const { data: counts, error: countsError } = await supabase
    .from('inventory_counts')
    .select('product_id, quantity')
    .eq('session_id', sessionId);
  if (countsError) {
    console.warn('[completeSession] could not fetch counts — last_known_quantity NOT updated:', countsError.message);
    return;
  }

  if (!counts || counts.length === 0) return;

  // Step 3: update last_known_quantity for each counted product.
  // Skip null/undefined/NaN — do not overwrite with empty values.
  const validCounts = counts.filter((c) => {
    const qty = Number(c.quantity);
    return c.quantity !== null && c.quantity !== undefined && !isNaN(qty);
  });

  await Promise.allSettled(
    validCounts.map(async (count) => {
      const { error } = await supabase
        .from('products')
        .update({ last_known_quantity: Number(count.quantity) })
        .eq('id', count.product_id);
      if (error) throw error;
    }),
  );
}

export async function getSessionCounts(sessionId: string): Promise<CountRow[]> {
  const { data, error } = await supabase
    .from('inventory_counts')
    .select('id, session_id, product_id, quantity, updated_by, updated_at')
    .eq('session_id', sessionId);
  if (error) throw error;
  return data as CountRow[];
}

export async function cancelSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('inventory_sessions')
    .delete()
    .eq('id', sessionId);
  if (error) {
    console.error('[cancelSession] error:', error.message, 'code:', error.code);
    throw new Error(`Cancel failed: ${error.message}`);
  }
}

export async function getLatestSessionCount(
  sessionId: string,
): Promise<CountRow | null> {
  const { data, error } = await supabase
    .from('inventory_counts')
    .select('id, session_id, product_id, quantity, updated_by, updated_at')
    .eq('session_id', sessionId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as CountRow | null;
}

export async function upsertCount(
  sessionId: string,
  productId: string,
  quantity: number,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('inventory_counts')
    .upsert(
      {
        session_id: sessionId,
        product_id: productId,
        quantity,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,product_id' },
    );
  if (error) {
    throw new Error(`Count save failed: ${error.message} (code: ${error.code})`);
  }
}
