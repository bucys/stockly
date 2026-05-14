import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyId } from '@/lib/useCompanyId';
import { getLocations, type Location } from '@/services/locations';
import {
  listEmployeesWithAssignments,
  assignEmployeeToLocation,
  unassignEmployeeFromLocation,
  type EmployeeWithAssignments,
} from '@/services/assignments';
import { listCompanyMemberProfiles, type UserProfile } from '@/services/profiles';
import { theme, shadows } from '@/constants/theme';
import { EmployeeRow } from '@/components/employees/EmployeeRow';
import { EmployeeAccessSheet } from '@/components/employees/EmployeeAccessSheet';

export default function EmployeesScreen() {
  const { companyId, role, loading } = useCompanyId();
  const [employees, setEmployees] = useState<EmployeeWithAssignments[]>([]);
  const [profilesByUserId, setProfilesByUserId] = useState<Map<string, UserProfile>>(
    new Map(),
  );
  const [locations, setLocations] = useState<Location[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [editingEmployee, setEditingEmployee] =
    useState<EmployeeWithAssignments | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!companyId || role !== 'admin') return;
    setEmployeesLoading(true);

    const [empsRes, locsRes, profilesRes] = await Promise.allSettled([
      listEmployeesWithAssignments(companyId),
      getLocations(companyId),
      listCompanyMemberProfiles(companyId),
    ]);

    if (empsRes.status === 'fulfilled') {
      setEmployees(empsRes.value);
    } else {
      Alert.alert(
        'Error',
        empsRes.reason instanceof Error ? empsRes.reason.message : 'Failed to load employees',
      );
    }

    if (locsRes.status === 'fulfilled') {
      setLocations(locsRes.value);
    }

    if (profilesRes.status === 'fulfilled') {
      const map = new Map<string, UserProfile>();
      for (const p of profilesRes.value) map.set(p.user_id, p);
      setProfilesByUserId(map);
    }

    setEmployeesLoading(false);
  }, [companyId, role]);

  useEffect(() => {
    load();
  }, [load]);

  function nameFor(userId: string): { title: string; subtitle: string | null } {
    const p = profilesByUserId.get(userId);
    const name = p?.display_name?.trim();
    const email = p?.email?.trim();
    if (name) return { title: name, subtitle: email && email !== name ? email : null };
    if (email) return { title: email, subtitle: null };
    return { title: `Employee · ${userId.slice(0, 8)}`, subtitle: null };
  }

  function displayFor(userId: string): string {
    return nameFor(userId).title;
  }

  function assignmentLabel(emp: EmployeeWithAssignments): string {
    const n = emp.assignments.length;
    if (n === 0) return 'No locations assigned';
    if (n === 1) {
      const loc = locations.find((l) => l.id === emp.assignments[0].location_id);
      return loc?.name ?? '1 location assigned';
    }
    return `${n} locations assigned`;
  }

  function openEditor(employee: EmployeeWithAssignments) {
    setEditingEmployee(employee);
    setSelectedIds(new Set(employee.assignments.map((a) => a.location_id)));
  }

  function closeEditor() {
    if (saving) return;
    setEditingEmployee(null);
    setSelectedIds(new Set());
  }

  function toggleSelected(locationId: string) {
    if (saving) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(locationId)) next.delete(locationId);
      else next.add(locationId);
      return next;
    });
  }

  function diffFor(employee: EmployeeWithAssignments): {
    added: string[];
    removed: string[];
  } {
    const original = new Set(employee.assignments.map((a) => a.location_id));
    const added: string[] = [];
    const removed: string[] = [];
    for (const id of selectedIds) if (!original.has(id)) added.push(id);
    for (const id of original) if (!selectedIds.has(id)) removed.push(id);
    return { added, removed };
  }

  async function applyDiff(employee: EmployeeWithAssignments) {
    if (!companyId) return;
    const { added, removed } = diffFor(employee);
    if (added.length === 0 && removed.length === 0) return;

    setSaving(true);
    try {
      await Promise.all([
        ...added.map((locationId) =>
          assignEmployeeToLocation({
            companyId,
            userId: employee.user_id,
            locationId,
          }),
        ),
        ...removed.map((locationId) =>
          unassignEmployeeFromLocation({ userId: employee.user_id, locationId }),
        ),
      ]);
      const refreshed = await listEmployeesWithAssignments(companyId);
      setEmployees(refreshed);
      setEditingEmployee(null);
      setSelectedIds(new Set());
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  const hasChanges = useMemo(() => {
    if (!editingEmployee) return false;
    const { added, removed } = diffFor(editingEmployee);
    return added.length + removed.length > 0;
    // diffFor closes over selectedIds, so recompute when either changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingEmployee, selectedIds]);

  function handleSave() {
    if (!editingEmployee) return;
    const { removed } = diffFor(editingEmployee);
    if (removed.length === 0) {
      applyDiff(editingEmployee);
      return;
    }
    Alert.alert(
      'Remove access?',
      'This employee will immediately lose access to selected locations and active sessions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove access',
          style: 'destructive',
          onPress: () => applyDiff(editingEmployee),
        },
      ],
    );
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Employees', headerBackTitle: 'Profile' }} />
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Employees', headerBackTitle: 'Profile' }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {employeesLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : employees.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={32} color={theme.colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No employees yet</Text>
            <Text style={styles.emptySub}>
              Share the join code so employees can sign up.
            </Text>
          </View>
        ) : (
          employees.map((emp) => {
            const { title, subtitle } = nameFor(emp.user_id);
            return (
              <EmployeeRow
                key={emp.user_id}
                title={title}
                subtitle={subtitle}
                assignedSummary={assignmentLabel(emp)}
                onPress={() => openEditor(emp)}
              />
            );
          })
        )}

        <EmployeeAccessSheet
          visible={editingEmployee != null}
          employeeLabel={editingEmployee ? displayFor(editingEmployee.user_id) : ''}
          locations={locations}
          selectedIds={selectedIds}
          saving={saving}
          hasChanges={hasChanges}
          onToggleLocation={toggleSelected}
          onCancel={closeEditor}
          onSave={handleSave}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: theme.spacing.lg, paddingBottom: 40 },

  loadingCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 24,
    alignItems: 'center',
    ...shadows.sm,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
