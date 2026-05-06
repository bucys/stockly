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
  console.log('[getSessions] location_id:', locationId);
  const { data, error } = await supabase
    .from('inventory_sessions')
    .select('id, location_id, created_at, status, created_by')
    .eq('location_id', locationId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[getSessions] error:', error.message, error);
    throw error;
  }
  console.log('[getSessions] result:', data?.length ?? 0, 'sessions');
  return data as Session[];
}

export async function createSession(locationId: string): Promise<Session> {
  console.log('[createSession] location_id:', locationId);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('inventory_sessions')
    .insert({ location_id: locationId, status: 'active', created_by: user?.id ?? null })
    .select()
    .single();
  if (error) {
    console.error('[createSession] error:', error.message, 'code:', error.code, error);
    throw new Error(`Session creation failed: ${error.message} (code: ${error.code})`);
  }
  console.log('[createSession] created session:', data.id);
  return data as Session;
}

export async function completeSession(sessionId: string): Promise<void> {
  console.log('[completeSession] session_id:', sessionId);

  // Step 1: mark session completed first — even if quantity propagation fails,
  // the session must be closed.
  const { error: statusError } = await supabase
    .from('inventory_sessions')
    .update({ status: 'completed' })
    .eq('id', sessionId);
  if (statusError) {
    console.error('[completeSession] status update error:', statusError.message, statusError);
    throw statusError;
  }
  console.log('[completeSession] session marked completed');

  // Step 2: fetch all counts for this session.
  const { data: counts, error: countsError } = await supabase
    .from('inventory_counts')
    .select('product_id, quantity')
    .eq('session_id', sessionId);
  if (countsError) {
    console.error('[completeSession] could not fetch counts — last_known_quantity NOT updated:', countsError.message);
    return;
  }
  console.log('[completeSession] counts found:', counts?.length ?? 0);

  if (!counts || counts.length === 0) {
    console.log('[completeSession] no counts to propagate');
    return;
  }

  // Step 3: update last_known_quantity for each counted product.
  // Skip null/undefined/NaN — do not overwrite with empty values.
  const validCounts = counts.filter((c) => {
    const qty = Number(c.quantity);
    return c.quantity !== null && c.quantity !== undefined && !isNaN(qty);
  });
  console.log('[completeSession] valid counts to propagate:', validCounts.length, '/', counts.length);

  const results = await Promise.allSettled(
    validCounts.map(async (count) => {
      const { error } = await supabase
        .from('products')
        .update({ last_known_quantity: Number(count.quantity) })
        .eq('id', count.product_id);
      if (error) {
        console.error('[completeSession] failed to update product', count.product_id, ':', error.message, 'code:', error.code);
        throw error;
      }
    }),
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;
  console.log('[completeSession] last_known_quantity updated:', succeeded, '— failed:', failed);
}

export async function getSessionCounts(sessionId: string): Promise<CountRow[]> {
  console.log('[getSessionCounts] session_id:', sessionId);
  const { data, error } = await supabase
    .from('inventory_counts')
    .select('id, session_id, product_id, quantity, updated_by, updated_at')
    .eq('session_id', sessionId);
  if (error) {
    console.error('[getSessionCounts] error:', error.message, error);
    throw error;
  }
  console.log('[getSessionCounts] result:', data?.length ?? 0, 'counts');
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
  console.log('[upsertCount] session:', sessionId, 'product:', productId, 'qty:', quantity, 'by:', userId);
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
    console.error('[upsertCount] error:', error.message, 'code:', error.code, error);
    throw new Error(`Count save failed: ${error.message} (code: ${error.code})`);
  }
  console.log('[upsertCount] success');
}
