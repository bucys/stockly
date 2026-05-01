import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useCompanyId } from '@/lib/useCompanyId';
import { signOut } from '@/services/auth';
import { getCompanyJoinCode } from '@/services/companies';
import { theme, shadows } from '@/constants/theme';

export default function ProfileTab() {
  const { companyId, role, loading } = useCompanyId();
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (role === 'admin' && companyId) {
      getCompanyJoinCode(companyId).then(setJoinCode);
    }
  }, [role, companyId]);

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
});
