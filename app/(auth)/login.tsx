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
import { signIn } from '@/services/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { theme } from '@/constants/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) return;
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/');
    } catch (err: unknown) {
      Alert.alert('Sign in failed', err instanceof Error ? err.message : 'Unknown error');
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
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to your account</Text>
          </View>

          <View style={styles.content}>
            <View style={styles.form}>
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
                placeholder="Your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
            </View>
          </View>

          <View style={styles.footer}>
            <Button
              title="Sign in"
              onPress={handleLogin}
              loading={loading}
            />
            <TouchableOpacity
              style={styles.secondaryLink}
              onPress={() => router.push('/(auth)/register')}
            >
              <Text style={styles.secondaryLinkText}>
                No account?{' '}
                <Text style={styles.secondaryLinkBold}>Create company</Text>
              </Text>
            </TouchableOpacity>
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
    paddingBottom: 32,
  },
  header: {
    marginBottom: 36,
  },
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
  form: {
    gap: 2,
  },
  content: {
    flexGrow: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textLight,
    letterSpacing: 1,
    marginBottom: 6,
  },
  footer: {
    marginTop: 28,
    gap: 6,
  },
  secondaryLink: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  secondaryLinkText: {
    fontSize: 15,
    color: theme.colors.textMuted,
  },
  secondaryLinkBold: {
    fontWeight: '700',
    color: theme.colors.text,
  },
});
