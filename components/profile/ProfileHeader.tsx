import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

interface Props {
  displayName: string | null;
  email: string | null;
  role: 'admin' | 'employee' | null;
}

export function ProfileHeader({ displayName, email, role }: Props) {
  const initial = (displayName?.trim()?.[0] ?? email?.trim()?.[0] ?? '?').toUpperCase();
  return (
    <View style={styles.profileHeader}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <Text style={styles.profileName} numberOfLines={1}>
        {displayName?.trim() || email || 'Your account'}
      </Text>
      {email && email !== displayName ? (
        <Text style={styles.profileEmail} numberOfLines={1}>{email}</Text>
      ) : null}
      <View style={styles.rolePill}>
        <View style={[styles.roleDot, role === 'admin' && styles.roleDotAdmin]} />
        <Text style={styles.rolePillText}>{role === 'admin' ? 'Admin' : 'Employee'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
