import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
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
import { ModalSheet } from '@/components/ui/ModalSheet';
import { listCompanyMemberProfiles, type UserProfile } from '@/services/profiles';
import { theme, shadows } from '@/constants/theme';

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
              <TouchableOpacity
                key={emp.user_id}
                style={styles.employeeRow}
                onPress={() => openEditor(emp)}
                activeOpacity={0.7}
              >
                <View style={styles.employeeRowLeft}>
                  <Text style={styles.employeeName}>{title}</Text>
                  {subtitle ? (
                    <Text style={styles.employeeEmail}>{subtitle}</Text>
                  ) : null}
                  <Text style={styles.employeeMeta}>{assignmentLabel(emp)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textLight} />
              </TouchableOpacity>
            );
          })
        )}

        <ModalSheet
          visible={editingEmployee != null}
          onClose={closeEditor}
          scrollable
          maxHeight="85%"
        >
          {editingEmployee && (
            <>
              <Text style={styles.sheetTitle}>Location access</Text>
              <Text style={styles.sheetSub}>{displayFor(editingEmployee.user_id)}</Text>
              {locations.length === 0 ? (
                <Text style={styles.sheetEmpty}>No locations in this company yet.</Text>
              ) : (
                locations.map((loc) => {
                  const checked = selectedIds.has(loc.id);
                  return (
                    <TouchableOpacity
                      key={loc.id}
                      style={styles.locRow}
                      onPress={() => toggleSelected(loc.id)}
                      activeOpacity={0.7}
                      disabled={saving}
                    >
                      <View style={styles.locRowLeft}>
                        <Text style={styles.locName}>{loc.name}</Text>
                        {loc.address ? (
                          <Text style={styles.locAddress}>{loc.address}</Text>
                        ) : null}
                      </View>
                      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                        {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
              {(() => {
                const { added, removed } = diffFor(editingEmployee);
                const dirty = added.length + removed.length > 0;
                return (
                  <View style={styles.footer}>
                    <TouchableOpacity
                      style={[styles.footerBtn, styles.footerCancel]}
                      onPress={closeEditor}
                      disabled={saving}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.footerCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.footerBtn,
                        styles.footerSave,
                        (!dirty || saving) && styles.footerSaveDisabled,
                      ]}
                      onPress={handleSave}
                      disabled={!dirty || saving}
                      activeOpacity={0.7}
                    >
                      {saving ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.footerSaveText}>Save changes</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })()}
            </>
          )}
        </ModalSheet>
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
  employeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    ...shadows.sm,
  },
  employeeRowLeft: { flex: 1 },
  employeeName: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  employeeEmail: {
    fontSize: 12,
    color: theme.colors.textLight,
    marginTop: 2,
  },
  employeeMeta: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 4,
  },

  sheetTitle: { fontSize: 19, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  sheetSub: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 16 },
  sheetEmpty: { fontSize: 13, color: theme.colors.textMuted, paddingVertical: 12 },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  locRowLeft: { flex: 1 },
  locName: { fontSize: 15, fontWeight: '500', color: theme.colors.text },
  locAddress: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },

  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  footerBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerCancel: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  footerCancelText: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
  footerSave: { backgroundColor: theme.colors.primary },
  footerSaveDisabled: { opacity: 0.4 },
  footerSaveText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
