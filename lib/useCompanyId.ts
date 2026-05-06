import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type UserRole = 'admin' | 'employee';

export function useCompanyId() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Right after register/join, the company_members row may not yet be
    // visible from the client (replication / RLS warmup). Retry a few times
    // before declaring "no membership found" so the UI doesn't flash an
    // "Account setup incomplete" error during a successful onboarding.
    async function fetchMembership(retriesLeft = 4) {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        setCompanyId(null);
        setRole(null);
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const { data: rows, error: queryError } = await supabase
        .from('company_members')
        .select('company_id, role, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(2);
      if (cancelled) return;

      if (queryError) {
        console.error('[useCompanyId] query error:', queryError.message, 'code:', queryError.code);
        setError(queryError.message);
        setLoading(false);
        return;
      }

      if (!rows || rows.length === 0) {
        if (retriesLeft > 0) {
          // Backoff: 400ms, 800ms, 1200ms, 1600ms.
          const delay = 400 * (5 - retriesLeft);
          setTimeout(() => {
            if (!cancelled) fetchMembership(retriesLeft - 1);
          }, delay);
          return;
        }
        console.warn('[useCompanyId] no company_members row found for user:', user.id);
        setCompanyId(null);
        setRole(null);
        setError('No company membership found for this user');
        setLoading(false);
        return;
      }

      if (rows.length > 1) {
        console.warn(
          '[useCompanyId] WARNING: multiple company_members rows for user:', user.id,
          '— using earliest one.',
        );
      }

      const row = rows[0];
      setCompanyId(row.company_id);
      setRole(row.role as UserRole);
      setError(null);
      setLoading(false);
    }

    fetchMembership();

    // Re-fetch on auth state changes (sign-in/sign-out, token refresh after
    // register/join completes). Keep loading=true while we re-resolve.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT') {
        setCompanyId(null);
        setRole(null);
        setError('Not authenticated');
        setLoading(false);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setLoading(true);
        setError(null);
        fetchMembership();
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { companyId, role, loading, error };
}
