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
import { useAssignedLocationIds } from '@/lib/useLocationAccess';
import { signOut } from '@/services/auth';
import { getCompanyJoinCode } from '@/services/companies';
import { getLocations, type Location } from '@/services/locations';
import { listEmployeesWithAssignments } from '@/services/assignments';
import {
  upsertMyProfile,
  getProfile,
  listCompanyMemberProfiles,
  type UserProfile,
} from '@/services/profiles';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import {
  listPendingAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
  type AccessRequest,
} from '@/services/accessRequests';
import { RequestAccessSheet } from '@/components/access/RequestAccessSheet';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';

export default function ProfileTab() {
  const { companyId, role, loading } = useCompanyId();
  const { ids: assignedIds, loading: assignedLoading } = useAssignedLocationIds();
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Current user's profile (display name + email)
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [myDisplayName, setMyDisplayName] = useState<string | null>(null);
  const [showNameEditor, setShowNameEditor] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [showRequestSheet, setShowRequestSheet] = useState(false);

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
  // auth, then load it into local state. Best-effort: failures are non-fatal.
  useEffect(() => {
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id;
        const email = auth.user?.email ?? null;
        if (!userId) return;
        setMyEmail(email);
        await upsertMyProfile({ email });
        const me = await getProfile(userId);
        // If the profile has no display_name yet but auth metadata captured
        // one at register/join time, promote it now.
        const metaName =
          typeof auth.user?.user_metadata?.display_name === 'string'
            ? (auth.user.user_metadata.display_name as string).trim()
            : '';
        if (me && !me.display_name && metaName) {
          await upsertMyProfile({ displayName: metaName, email });
          setMyDisplayName(metaName);
        } else if (me) {
          setMyDisplayName(me.display_name);
        }
        if (me?.email) setMyEmail(me.email);
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

  // Employee: load locations they can see (RLS restricts to assigned only).
  useEffect(() => {
    if (!companyId || role === 'admin') return;
    getLocations(companyId)
      .then(setLocations)
      .catch(() => {
        // non-critical
      });
  }, [companyId, role]);

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

  function openNameEditor() {
    setNameDraft(myDisplayName ?? '');
    setShowNameEditor(true);
  }

  async function saveDisplayName() {
    setSavingName(true);
    try {
      const trimmed = nameDraft.trim();
      const next = trimmed === '' ? null : trimmed;
      await upsertMyProfile({ displayName: next, email: myEmail });
      setMyDisplayName(next);
      setShowNameEditor(false);
      // Refresh admin caches so attribution updates immediately.
      if (role === 'admin' && companyId) loadAdminData();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save display name');
    } finally {
      setSavingName(false);
    }
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

  const initial = (myDisplayName?.trim()?.[0] ?? myEmail?.trim()?.[0] ?? '?').toUpperCase();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.profileName} numberOfLines={1}>
          {myDisplayName?.trim() || myEmail || 'Your account'}
        </Text>
        {myEmail && myEmail !== myDisplayName ? (
          <Text style={styles.profileEmail} numberOfLines={1}>{myEmail}</Text>
        ) : null}
        <View style={styles.rolePill}>
          <View style={[styles.roleDot, role === 'admin' && styles.roleDotAdmin]} />
          <Text style={styles.rolePillText}>{role === 'admin' ? 'Admin' : 'Employee'}</Text>
        </View>
      </View>

      {/* Profile — display name row */}
      <Text style={styles.sectionTitle}>Profile</Text>
      <View style={styles.group}>
        <TouchableOpacity
          style={styles.row}
          onPress={openNameEditor}
          activeOpacity={0.7}
        >
          <Text style={styles.rowLabel}>Display name</Text>
          <View style={styles.rowRight}>
            <Text
              style={[styles.rowValue, !myDisplayName && styles.rowValueEmpty]}
              numberOfLines={1}
            >
              {myDisplayName ?? 'Not set'}
            </Text>
            <Ionicons name="chevron-forward" size={15} color={theme.colors.textLight} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Admin: team join code */}
      {role === 'admin' && (
        <>
          <Text style={styles.sectionTitle}>Team join code</Text>
          <View style={styles.group}>
            <View style={styles.row}>
              {joinCode ? (
                <>
                  <Text style={styles.codeInline}>{joinCode}</Text>
                  <TouchableOpacity
                    onPress={handleCopy}
                    activeOpacity={0.7}
                    style={styles.copyInline}
                  >
                    <Ionicons
                      name={copied ? 'checkmark' : 'copy-outline'}
                      size={14}
                      color={copied ? theme.colors.success : theme.colors.primary}
                    />
                    <Text
                      style={[
                        styles.copyInlineText,
                        copied && { color: theme.colors.success },
                      ]}
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <ActivityIndicator color={theme.colors.primary} />
              )}
            </View>
          </View>
          <Text style={styles.helperText}>
            Share with team members so they can join.
          </Text>
        </>
      )}

      {/* Admin: access requests */}
      {role === 'admin' && pendingRequests.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Access requests</Text>
          <View style={styles.group}>
            {pendingRequests.map((req, idx) => {
              const deciding = requestDeciding === req.id;
              return (
                <View
                  key={req.id}
                  style={[
                    styles.requestItem,
                    idx < pendingRequests.length - 1 && styles.rowDivider,
                  ]}
                >
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.requestName} numberOfLines={1}>
                      {displayFor(req.user_id)}
                    </Text>
                    <Text style={styles.requestMeta} numberOfLines={1}>
                      {locationName(req.location_id)}
                    </Text>
                    {req.reason ? (
                      <Text style={styles.requestReason} numberOfLines={2}>
                        “{req.reason}”
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.requestActions}>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => decideRequest(req, 'reject')}
                      disabled={deciding}
                      activeOpacity={0.7}
                      hitSlop={6}
                    >
                      <Text style={styles.rejectBtnText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.approveBtn}
                      onPress={() => decideRequest(req, 'approve')}
                      disabled={deciding}
                      activeOpacity={0.85}
                      hitSlop={6}
                    >
                      {deciding ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.approveBtnText}>Approve</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* Admin: team navigation */}
      {role === 'admin' && (
        <>
          <Text style={styles.sectionTitle}>Team</Text>
          <View style={styles.group}>
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push('/employees')}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Employees</Text>
                <Text style={styles.rowSub}>
                  {employeeCount != null
                    ? `${employeeCount} ${employeeCount === 1 ? 'employee' : 'employees'}`
                    : 'Manage location access'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={theme.colors.textLight} />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Employee: my access */}
      {role !== 'admin' && (() => {
        const MAX_VISIBLE = 3;
        const assignedLocations =
          assignedIds == null
            ? locations
            : locations.filter((l) => assignedIds.has(l.id));
        const visible = assignedLocations.slice(0, MAX_VISIBLE);
        const remaining = assignedLocations.length - visible.length;
        const isLoading = assignedLoading && assignedLocations.length === 0;
        const hasAccess = !isLoading && assignedLocations.length > 0;
        return (
          <>
            <Text style={styles.sectionTitle}>My access</Text>
            <View style={styles.group}>
              {isLoading ? (
                <View style={styles.row}>
                  <ActivityIndicator color={theme.colors.primary} />
                </View>
              ) : hasAccess ? (
                <>
                  {visible.map((loc, idx) => (
                    <View
                      key={loc.id}
                      style={[
                        styles.row,
                        (idx < visible.length - 1 || remaining > 0) && styles.rowDivider,
                      ]}
                    >
                      <Text style={styles.rowLabel} numberOfLines={1}>
                        {loc.name}
                      </Text>
                    </View>
                  ))}
                  {remaining > 0 && (
                    <View style={[styles.row, styles.rowDivider]}>
                      <Text style={styles.rowSubInline}>+{remaining} more</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => setShowRequestSheet(true)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color: theme.colors.primary }]}>
                        Request access
                      </Text>
                      <Text style={styles.rowSub}>Ask an admin for another location</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={15} color={theme.colors.textLight} />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={[styles.row, styles.rowDivider]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>No locations assigned</Text>
                      <Text style={styles.rowSub}>Ask your admin for access</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => setShowRequestSheet(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.rowLabel, { color: theme.colors.primary }]}>
                      Request access
                    </Text>
                    <Ionicons name="chevron-forward" size={15} color={theme.colors.textLight} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </>
        );
      })()}

      {/* Sign out — visually separated danger zone */}
      <View style={styles.dangerDivider} />
      <View style={[styles.group, styles.dangerGroup]}>
        <TouchableOpacity
          style={styles.row}
          onPress={handleSignOut}
          disabled={signingOut}
          activeOpacity={0.7}
        >
          <Text style={[styles.signOutText, signingOut && styles.signOutTextDisabled]}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Text>
        </TouchableOpacity>
      </View>

      <ModalSheet
        visible={showNameEditor}
        onClose={() => !savingName && setShowNameEditor(false)}
        avoidKeyboard
        maxHeight="60%"
      >
        <Text style={styles.editorTitle}>Edit display name</Text>
        <Text style={styles.editorSub}>
          Leave empty to clear — your email will be shown instead.
        </Text>
        <Input
          placeholder="Display name"
          value={nameDraft}
          onChangeText={setNameDraft}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={saveDisplayName}
        />
        <Button title="Save" onPress={saveDisplayName} loading={savingName} />
        <Button
          title="Cancel"
          onPress={() => setShowNameEditor(false)}
          variant="ghost"
        />
      </ModalSheet>

      <RequestAccessSheet
        visible={showRequestSheet}
        onClose={() => setShowRequestSheet(false)}
        assignedLocationIds={assignedIds ?? undefined}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: theme.spacing.lg, paddingTop: 12, paddingBottom: 40 },

  // Header
  profileHeader: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 24,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '700',
    color: theme.colors.text,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    maxWidth: '100%',
  },
  profileEmail: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  roleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.textLight,
  },
  roleDotAdmin: { backgroundColor: theme.colors.primary },
  rolePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },

  // Sections
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMuted,
    marginTop: 18,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  group: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  helperText: {
    fontSize: 12,
    color: theme.colors.textLight,
    marginTop: 6,
    paddingHorizontal: 4,
  },

  // Generic row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  rowLabel: {
    fontSize: 15,
    color: theme.colors.text,
    flex: 1,
  },
  rowSub: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '60%',
  },
  rowValue: {
    fontSize: 14,
    color: theme.colors.textMuted,
    flexShrink: 1,
    textAlign: 'right',
  },
  rowValueEmpty: { color: theme.colors.textLight },
  rowSubInline: {
    fontSize: 13,
    color: theme.colors.textMuted,
    flex: 1,
  },

  // Inline join code
  codeInline: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 3,
    color: theme.colors.text,
  },
  copyInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  copyInlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primary,
  },

  // Access requests
  requestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  requestName: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  requestMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  requestReason: {
    fontSize: 12,
    color: theme.colors.textLight,
    marginTop: 4,
    fontStyle: 'italic',
  },
  requestActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rejectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
  },
  rejectBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.danger,
  },
  approveBtn: {
    backgroundColor: theme.colors.success,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.md,
    minWidth: 76,
    alignItems: 'center',
  },
  approveBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Sign out — danger zone
  dangerDivider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
    marginTop: 40,
    marginBottom: 20,
    marginHorizontal: -theme.spacing.lg,
    opacity: 0.6,
  },
  dangerGroup: {
    marginBottom: 24,
  },
  signOutText: {
    fontSize: 15,
    color: theme.colors.danger,
    fontWeight: '500',
    textAlign: 'center',
    flex: 1,
  },
  signOutTextDisabled: { color: theme.colors.textLight },

  // Editor modal
  editorTitle: { fontSize: 19, fontWeight: '700', color: theme.colors.text, marginBottom: 6 },
  editorSub: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 16 },
});
