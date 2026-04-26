import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type UserRole = 'admin' | 'employee';

export function useCompanyId() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetch() {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('[useCompanyId] user id:', user?.id ?? 'null');

      if (!user) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      // Use limit(2) so we can warn about duplicates without fetching all rows.
      const { data: rows, error: queryError } = await supabase
        .from('company_members')
        .select('company_id, role, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(2);

      if (queryError) {
        console.error('[useCompanyId] query error:', queryError.message, 'code:', queryError.code, queryError);
        setError(queryError.message);
        setLoading(false);
        return;
      }

      if (!rows || rows.length === 0) {
        console.warn('[useCompanyId] no company_members row found for user:', user.id);
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
      console.log('[useCompanyId] company_id:', row.company_id, 'role:', row.role);
      setCompanyId(row.company_id);
      setRole(row.role as UserRole);
      setLoading(false);
    }

    fetch();
  }, []);

  return { companyId, role, loading, error };
}
