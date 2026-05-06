import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useCompanyId } from '@/lib/useCompanyId';
import { getMyAssignedLocationIds } from '@/services/assignments';

interface AssignedIdsState {
  // null  → no filter (admin sees all, or still resolving role)
  // Set   → employee's allowed location ids (possibly empty)
  ids: Set<string> | null;
  loading: boolean;
}

// Phase 1 helper: pure UI filtering. RLS still permits everything; this only
// hides locations from employees in the UI.
export function useAssignedLocationIds(): AssignedIdsState {
  const { role, loading: roleLoading } = useCompanyId();
  const [ids, setIds] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (roleLoading) return;
    let cancelled = false;
    if (role !== 'employee') {
      setIds(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    getMyAssignedLocationIds()
      .then((arr) => {
        if (cancelled) return;
        setIds(new Set(arr));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // On failure, deny by default (empty set) so we don't accidentally show
        // locations the user isn't supposed to see. RLS still backs us up.
        setIds(new Set());
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role, roleLoading]);

  return { ids, loading };
}

// Defensive route guard: alert + go back if an employee opens a location they
// aren't assigned to. Admins are always allowed.
export function useLocationAccessGuard(locationId: string | undefined) {
  const { role, loading: roleLoading } = useCompanyId();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (roleLoading || !locationId || checked) return;
    if (role !== 'employee') {
      setChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ids = await getMyAssignedLocationIds();
        if (cancelled) return;
        if (!ids.includes(locationId)) {
          Alert.alert('Access denied', 'You do not have access to this location.', [
            {
              text: 'OK',
              onPress: () => {
                if (router.canGoBack()) router.back();
                else router.replace('/(app)/(tabs)');
              },
            },
          ]);
        }
        setChecked(true);
      } catch {
        if (cancelled) return;
        setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, roleLoading, locationId, checked]);
}
