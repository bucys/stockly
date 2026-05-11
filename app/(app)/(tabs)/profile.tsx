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
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCompanyId } from '@/lib/useCompanyId';
import { signOut } from '@/services/auth';
import { getCompanyJoinCode } from '@/services/companies';
import { getLocations, type Location } from '@/services/locations';
import {
  listEmployeesWithAssignments,
  assignEmployeeToLocation,
  unassignEmployeeFromLocation,
  type EmployeeWithAssignments,
} from '@/services/assignments';
import { ModalSheet } from '@/components/ui/ModalSheet';
import {
  upsertMyProfile,
  listCompanyMemberProfiles,
  type UserProfile,
} from '@/services/profiles';
import { supabase } from '@/lib/supabase';
import { theme, shadows } from '@/constants/theme';

export default function ProfileTab() {
  const { companyId, role, loading } = useCompanyId();
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Employees + assignments (admin only)
  const [employees, setEmployees] = useState<EmployeeWithAssignments[]>([]);
  const [profilesByUserId, setProfilesByUserId] = useState<Map<string, UserProfile>>(
    new Map(),
  );
  const [locations, setLocations] = useState<Location[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [editingEmployee, setEditingEmployee] =
    useState<EmployeeWithAssignments | null>(null);
  const [assignmentSaving, setAssignmentSaving] = useState<string | null>(null);

  useEffect(() => {
    if (role === 'admin' && companyId) {
      getCompanyJoinCode(companyId).then(setJoinCode);
    }
  }, [role, companyId]);

  // Ensure the current user has a profile row with their email mirrored from
  // auth. Best-effort: failures are non-fatal.
  useEffect(() => {
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const email = auth.user?.email ?? null;
        if (!auth.user) return;
        await upsertMyProfile({ email });
      } catch {
        // ignore — profile sync is non-critical
      }
    })();
  }, []);

  const loadEmployees = useCallback(async () => {
    if (!companyId || role !== 'admin') return;
    setEmployeesLoading(true);

    // Run independently. Profile lookup is optional — its failure must NOT
    // blank out the employees list.
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
    loadEmployees();
  }, [loadEmployees]);

  function displayFor(userId: string): string {
    const p = profilesByUserId.get(userId);
    if (p?.display_name && p.display_name.trim() !== '') return p.display_name;
    if (p?.email && p.email.trim() !== '') return p.email;
    return `Employee · ${userId.slice(0, 8)}`;
  }

  async function applyAssignmentChange(
    employee: EmployeeWithAssignments,
    locationId: string,
    action: 'assign' | 'unassign',
  ) {
    if (!companyId) return;
    setAssignmentSaving(locationId);
    try {
      if (action === 'unassign') {
        await unassignEmployeeFromLocation({ userId: employee.user_id, locationId });
      } else {
        await assignEmployeeToLocation({
          companyId,
          userId: employee.user_id,
          locationId,
        });
      }
      const refreshed = await listEmployeesWithAssignments(companyId);
      setEmployees(refreshed);
      const updated = refreshed.find((e) => e.user_id === employee.user_id) ?? null;
      setEditingEmployee(updated);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update assignment');
    } finally {
      setAssignmentSaving(null);
    }
  }

  function toggleAssignment(employee: EmployeeWithAssignments, locationId: string) {
    if (!companyId) return;
    const isAssigned = employee.assignments.some((a) => a.location_id === locationId);
    if (!isAssigned) {
      applyAssignmentChange(employee, locationId, 'assign');
      return;
    }
    Alert.alert(
      'Remove access?',
      'This employee will lose access to this location and its sessions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => applyAssignmentChange(employee, locationId, 'unassign'),
        },
      ],
    );
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      Alert.alert('Error', 'Failed to sign out');
      setSigningOut(false);
    }
  }

  async function handleCopy() {
    if (!joinCode) return;
    await Clipboard.setStringAsync(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Role badge */}
      <View style={styles.roleBadge}>
        <Text style={styles.roleText}>{role === 'admin' ? 'Admin' : 'Employee'}</Text>
      </View>

      {/* Admin: join code section */}
      {role === 'admin' && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>EMPLOYEE JOIN CODE</Text>
          <View style={styles.codeCard}>
            {joinCode ? (
              <>
                <Text style={styles.codeValue}>{joinCode}</Text>
                <Text style={styles.codeHint}>Share this code with team members so they can join.</Text>
                <TouchableOpacity
                  style={[styles.copyBtn, copied && styles.copyBtnCopied]}
                  onPress={handleCopy}
                  activeOpacity={0.75}
                >
                  <Text style={styles.copyBtnText}>{copied ? 'Copied ✓' : 'Copy code'}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <ActivityIndicator color={theme.colors.primary} />
            )}
          </View>
        </View>
      )}

      {/* Admin: employees & location access */}
      {role === 'admin' && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>EMPLOYEES</Text>
          {employeesLoading ? (
            <View style={styles.employeeLoading}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : employees.length === 0 ? (
            <View style={styles.employeeEmpty}>
              <Text style={styles.employeeEmptyText}>
                No employees yet. Share the join code above so they can sign up.
              </Text>
            </View>
          ) : (
            employees.map((emp) => (
              <TouchableOpacity
                key={emp.user_id}
                style={styles.employeeRow}
                onPress={() => setEditingEmployee(emp)}
                activeOpacity={0.7}
              >
                <View style={styles.employeeRowLeft}>
                  <Text style={styles.employeeName}>{displayFor(emp.user_id)}</Text>
                  <Text style={styles.employeeMeta}>
                    {emp.assignments.length}{' '}
                    {emp.assignments.length === 1 ? 'location' : 'locations'} assigned
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textLight} />
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      {/* Sign out */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <TouchableOpacity
          style={styles.signOutRow}
          onPress={handleSignOut}
          disabled={signingOut}
          activeOpacity={0.7}
        >
          <Text style={[styles.signOutText, signingOut && styles.signOutTextDisabled]}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Assignment editor */}
      <ModalSheet
        visible={editingEmployee != null}
        onClose={() => setEditingEmployee(null)}
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
                const assigned = editingEmployee.assignments.some(
                  (a) => a.location_id === loc.id,
                );
                const saving = assignmentSaving === loc.id;
                return (
                  <TouchableOpacity
                    key={loc.id}
                    style={styles.locRow}
                    onPress={() => toggleAssignment(editingEmployee, loc.id)}
                    activeOpacity={0.7}
                    disabled={saving}
                  >
                    <View style={styles.locRowLeft}>
                      <Text style={styles.locName}>{loc.name}</Text>
                      {loc.address ? (
                        <Text style={styles.locAddress}>{loc.address}</Text>
                      ) : null}
                    </View>
                    {saving ? (
                      <ActivityIndicator color={theme.colors.primary} />
                    ) : (
                      <View style={[styles.checkbox, assigned && styles.checkboxOn]}>
                        {assigned && (
                          <Ionicons name="checkmark" size={14} color="#fff" />
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}
      </ModalSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: theme.spacing.lg, paddingBottom: 40 },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 28,
  },
  roleText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textLight,
    letterSpacing: 1,
    marginBottom: 10,
  },
  codeCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 20,
    alignItems: 'center',
    ...shadows.sm,
  },
  codeValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 6,
    color: theme.colors.text,
    marginBottom: 10,
  },
  codeHint: {
    fontSize: 13,
    color: theme.colors.textLight,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  copyBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  copyBtnCopied: { backgroundColor: theme.colors.success },
  copyBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  signOutRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 18,
    ...shadows.sm,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.danger,
    textAlign: 'center',
  },
  signOutTextDisabled: { color: theme.colors.textLight },

  employeeLoading: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 24,
    alignItems: 'center',
    ...shadows.sm,
  },
  employeeEmpty: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 18,
    ...shadows.sm,
  },
  employeeEmptyText: {
    fontSize: 13,
    color: theme.colors.textMuted,
    lineHeight: 18,
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
  employeeName: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  employeeMeta: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
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
});
