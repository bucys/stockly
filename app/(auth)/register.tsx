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
import { router } from 'expo-router';
import { signUp } from '@/services/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { theme } from '@/constants/theme';

export default function RegisterScreen() {
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!companyName || !email || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await signUp(email.trim(), password, companyName.trim());
      Alert.alert(
        'Account created',
        'Check your email to confirm your account, then sign in.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }],
      );
    } catch (err: unknown) {
      console.error('[RegisterScreen] registration error:', err);
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      Alert.alert('Registration failed', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoMark}>
          <Text style={styles.logoMarkText}>IT</Text>
        </View>

        <Text style={styles.title}>Create Company</Text>
        <Text style={styles.subtitle}>Set up your workspace — you'll be the admin</Text>

        <Text style={styles.label}>Company name</Text>
        <Input
          placeholder="e.g. Acme Warehouse"
          value={companyName}
          onChangeText={setCompanyName}
          autoCapitalize="words"
          style={styles.inputSpacing}
        />

        <Text style={styles.label}>Email</Text>
        <Input
          placeholder="you@company.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          style={styles.inputSpacing}
        />

        <Text style={styles.label}>Password</Text>
        <Input
          placeholder="Min 6 characters"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          style={styles.inputSpacing}
        />

        <Button
          title="Create Account"
          onPress={handleRegister}
          loading={loading}
          style={{ marginTop: 8, marginBottom: 0 }}
        />

        <TouchableOpacity style={styles.link} onPress={() => router.back()}>
          <Text style={styles.linkText}>← Back to sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  inner: {
    paddingHorizontal: 28,
    paddingTop: 80,
    paddingBottom: 48,
  },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  logoMarkText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textMuted,
    marginBottom: 36,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 8,
    marginTop: 4,
  },
  inputSpacing: {
    marginBottom: 16,
  },
  link: {
    marginTop: 24,
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontWeight: '500',
  },
});
