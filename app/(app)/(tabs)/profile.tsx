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
import {
  listPendingAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
  type AccessRequest,
} from '@/services/accessRequests';
import { RequestAccessSheet } from '@/components/access/RequestAccessSheet';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileRow } from '@/components/profile/ProfileRow';
import { AccessRequestRow } from '@/components/profile/AccessRequestRow';
import { MyAccessSection } from '@/components/profile/MyAccessSection';
import { DisplayNameSheet } from '@/components/profile/DisplayNameSheet';
import { profileStyles } from '@/components/profile/styles';
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <ProfileHeader displayName={myDisplayName} email={myEmail} role={role} />

      <Text style={profileStyles.sectionTitle}>Profile</Text>
      <View style={profileStyles.group}>
        <ProfileRow
          label="Display name"
          value={myDisplayName ?? 'Not set'}
          valueIsEmpty={!myDisplayName}
          onPress={openNameEditor}
          showChevron={false}
        />
      </View>

      {role === 'admin' && (
        <>
          <Text style={profileStyles.sectionTitle}>Team join code</Text>
          <View style={profileStyles.group}>
            <View style={profileStyles.row}>
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
          <Text style={profileStyles.helperText}>
            Share with team members so they can join.
          </Text>
        </>
      )}

      {role === 'admin' && pendingRequests.length > 0 && (
        <>
          <Text style={profileStyles.sectionTitle}>Access requests</Text>
          <View style={profileStyles.group}>
            {pendingRequests.map((req, idx) => (
              <AccessRequestRow
                key={req.id}
                employeeName={displayFor(req.user_id)}
                locationName={locationName(req.location_id)}
                reason={req.reason}
                deciding={requestDeciding === req.id}
                isLast={idx === pendingRequests.length - 1}
                onApprove={() => decideRequest(req, 'approve')}
                onReject={() => decideRequest(req, 'reject')}
              />
            ))}
          </View>
        </>
      )}

      {role === 'admin' && (
        <>
          <Text style={profileStyles.sectionTitle}>Team</Text>
          <View style={profileStyles.group}>
            <ProfileRow
              label="Employees"
              sub={
                employeeCount != null
                  ? `${employeeCount} ${employeeCount === 1 ? 'employee' : 'employees'}`
                  : 'Manage location access'
              }
              onPress={() => router.push('/employees')}
            />
          </View>
        </>
      )}

      {role !== 'admin' && (
        <MyAccessSection
          assignedIds={assignedIds}
          assignedLoading={assignedLoading}
          locations={locations}
          onRequestAccess={() => setShowRequestSheet(true)}
        />
      )}

      {/* Sign out — visually separated danger zone */}
      <View style={styles.dangerDivider} />
      <View style={[profileStyles.group, styles.dangerGroup]}>
        <TouchableOpacity
          style={profileStyles.row}
          onPress={handleSignOut}
          disabled={signingOut}
          activeOpacity={0.7}
        >
          <Text style={[styles.signOutText, signingOut && styles.signOutTextDisabled]}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Text>
        </TouchableOpacity>
      </View>

      <DisplayNameSheet
        visible={showNameEditor}
        draft={nameDraft}
        saving={savingName}
        onChangeDraft={setNameDraft}
        onSave={saveDisplayName}
        onClose={() => setShowNameEditor(false)}
      />

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

  // Inline join code (rendered inline inside the admin join-code group)
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

  // Sign out — danger zone (kept inline to preserve negative-margin divider)
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
});
