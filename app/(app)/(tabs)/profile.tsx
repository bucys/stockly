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
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCompanyId } from '@/lib/useCompanyId';
import { signOut } from '@/services/auth';
import { getCompanyJoinCode } from '@/services/companies';
import { getLocations, type Location } from '@/services/locations';
import { listEmployeesWithAssignments } from '@/services/assignments';
import {
  upsertMyProfile,
  listCompanyMemberProfiles,
  type UserProfile,
} from '@/services/profiles';
import {
  listPendingAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
  type AccessRequest,
} from '@/services/accessRequests';
import { supabase } from '@/lib/supabase';
import { theme, shadows } from '@/constants/theme';

export default function ProfileTab() {
  const { companyId, role, loading } = useCompanyId();
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Admin-only data: employee count for the row, locations + profiles for
  // access request rendering, pending requests themselves.
  const [employeeCount, setEmployeeCount] = useState<number | null>(null);
  const [profilesByUserId, setProfilesByUserId] = useState<Map<string, UserProfile>>(
    new Map(),
  );
  const [locations, setLocations] = useState<Location[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<AccessRequest[]>([]);
  const [requestDeciding, setRequestDeciding] = useState<string | null>(null);

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

  const loadAdminData = useCallback(async () => {
    if (!companyId || role !== 'admin') return;
    setAdminLoading(true);

    const [empsRes, locsRes, profilesRes, requestsRes] = await Promise.allSettled([
      listEmployeesWithAssignments(companyId),
      getLocations(companyId),
      listCompanyMemberProfiles(companyId),
      listPendingAccessRequests(companyId),
    ]);

    if (empsRes.status === 'fulfilled') {
      setEmployeeCount(empsRes.value.length);
    }

    if (locsRes.status === 'fulfilled') {
      setLocations(locsRes.value);
    }

    if (profilesRes.status === 'fulfilled') {
      const map = new Map<string, UserProfile>();
      for (const p of profilesRes.value) map.set(p.user_id, p);
      setProfilesByUserId(map);
    }

    if (requestsRes.status === 'fulfilled') {
      setPendingRequests(requestsRes.value);
    }

    setAdminLoading(false);
  }, [companyId, role]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  function displayFor(userId: string): string {
    const p = profilesByUserId.get(userId);
    if (p?.display_name && p.display_name.trim() !== '') return p.display_name;
    if (p?.email && p.email.trim() !== '') return p.email;
    return `Employee · ${userId.slice(0, 8)}`;
  }

  async function decideRequest(req: AccessRequest, decision: 'approve' | 'reject') {
    setRequestDeciding(req.id);
    try {
      if (decision === 'approve') {
        await approveAccessRequest(req.id);
      } else {
        await rejectAccessRequest(req.id);
      }
      await loadAdminData();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update request');
    } finally {
      setRequestDeciding(null);
    }
  }

  function locationName(locationId: string): string {
    return locations.find((l) => l.id === locationId)?.name ?? 'Unknown location';
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

      {/* Admin: pending access requests */}
      {role === 'admin' && pendingRequests.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACCESS REQUESTS</Text>
          {pendingRequests.map((req) => {
            const deciding = requestDeciding === req.id;
            return (
              <View key={req.id} style={styles.requestRow}>
                <View style={styles.requestRowTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.requestEmployee}>{displayFor(req.user_id)}</Text>
                    <Text style={styles.requestLocation}>{locationName(req.location_id)}</Text>
                    {req.reason ? (
                      <Text style={styles.requestReason}>“{req.reason}”</Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={[styles.requestBtn, styles.requestReject]}
                    onPress={() => decideRequest(req, 'reject')}
                    disabled={deciding}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.requestRejectText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.requestBtn, styles.requestApprove]}
                    onPress={() => decideRequest(req, 'approve')}
                    disabled={deciding}
                    activeOpacity={0.7}
                  >
                    {deciding ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.requestApproveText}>Approve</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Admin: employees entry point */}
      {role === 'admin' && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TEAM</Text>
          <TouchableOpacity
            style={styles.navRow}
            onPress={() => router.push('/employees')}
            activeOpacity={0.7}
          >
            <View style={styles.navRowLeft}>
              <Text style={styles.navRowTitle}>Employees</Text>
              <Text style={styles.navRowSub}>Manage employee location access</Text>
            </View>
            <View style={styles.navRowRight}>
              {employeeCount != null && (
                <Text style={styles.navRowCount}>{employeeCount}</Text>
              )}
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textLight} />
            </View>
          </TouchableOpacity>
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

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...shadows.sm,
  },
  navRowLeft: { flex: 1 },
  navRowTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  navRowSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  navRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navRowCount: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },

  requestRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 14,
    marginBottom: 8,
    ...shadows.sm,
  },
  requestRowTop: { marginBottom: 10 },
  requestEmployee: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  requestLocation: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  requestReason: {
    fontSize: 12,
    color: theme.colors.textLight,
    marginTop: 4,
    fontStyle: 'italic',
  },
  requestActions: { flexDirection: 'row', gap: 8 },
  requestBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestApprove: { backgroundColor: theme.colors.primary },
  requestApproveText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  requestReject: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  requestRejectText: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
});
