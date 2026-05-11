import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { joinCompany } from '@/services/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { theme } from '@/constants/theme';

export default function JoinScreen() {
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleJoin() {
    if (!joinCode.trim() || !displayName.trim() || !email.trim() || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await joinCompany(email.trim(), password, joinCode.trim(), displayName.trim());
      router.replace('/');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      console.error('[JoinScreen] join error:', message);
      Alert.alert('Join failed', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>‹ Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Join a team</Text>
            <Text style={styles.subtitle}>Enter the code from your admin</Text>
          </View>

          <View style={styles.content}>
            <View style={styles.form}>
              <Text style={styles.label}>JOIN CODE</Text>
              <Input
                placeholder="e.g. A3F7B21C"
                value={joinCode}
                onChangeText={(t) => setJoinCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                maxLength={8}
                style={styles.codeInput}
                returnKeyType="next"
              />

              <Text style={styles.label}>YOUR NAME</Text>
              <Input
                placeholder="e.g. Jonas"
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                returnKeyType="next"
              />

              <Text style={styles.label}>EMAIL</Text>
              <Input
                placeholder="you@company.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                returnKeyType="next"
              />

              <Text style={styles.label}>PASSWORD</Text>
              <Input
                placeholder="Min 6 characters"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                returnKeyType="done"
                onSubmitEditing={handleJoin}
              />
            </View>
          </View>

          <View style={styles.footer}>
            <Button
              title="Join team"
              onPress={handleJoin}
              loading={loading}
              disabled={!joinCode.trim() || !displayName.trim() || !email.trim() || !password}
              style={{ marginBottom: 0 }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  root: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 40,
  },
  header: { marginBottom: 36 },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    marginBottom: 20,
  },
  backBtnText: {
    fontSize: 16,
    color: theme.colors.textMuted,
    fontWeight: '500',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textMuted,
  },
  form: { gap: 2 },
  content: { flexGrow: 1 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textLight,
    letterSpacing: 1,
    marginBottom: 6,
  },
  codeInput: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 6,
    textAlign: 'center',
    marginBottom: 20,
  },
  footer: { marginTop: 28, gap: 6 },
});
