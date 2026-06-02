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
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { theme } from '@/constants/theme';
import { PasswordStrengthMeter } from '@/components/auth/PasswordStrengthMeter';
import { evaluatePassword } from '@/lib/passwordStrength';
import {
  sendInviteOtp,
  verifyInviteOtp,
  acceptInvitation,
  setPasswordAndName,
} from '@/services/invitations';
import { signOut } from '@/services/auth';

type Step = 'email' | 'code' | 'profile';

export default function InviteScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSendCode() {
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert('Invalid email', 'Enter the email your invite was sent to.');
      return;
    }
    setLoading(true);
    try {
      await sendInviteOtp(trimmed);
      setStep('code');
    } catch (err) {
      Alert.alert(
        'Could not send code',
        err instanceof Error ? err.message : 'Please check the email and try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (code.trim().length < 6) {
      Alert.alert('Enter the code', 'Type the 6-digit code from your email.');
      return;
    }
    setLoading(true);
    try {
      await verifyInviteOtp(email, code);
      // Session is now active. Consume the invitation → membership + locations.
      const result = await acceptInvitation();
      if (!result.ok && result.reason === 'no_invite') {
        await signOut();
        Alert.alert(
          'No invitation found',
          'We couldn’t find an invite for this email. Ask your admin to resend it.',
        );
        setStep('email');
        return;
      }
      setStep('profile');
    } catch (err) {
      Alert.alert(
        'Verification failed',
        err instanceof Error ? err.message : 'The code may be wrong or expired.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleFinish() {
    if (!displayName.trim()) {
      Alert.alert('Missing name', 'Please enter your name.');
      return;
    }
    if (!evaluatePassword(password).acceptable) {
      Alert.alert(
        'Weak password',
        'Use at least 8 characters with a mix of uppercase, lowercase, numbers and symbols.',
      );
      return;
    }
    setLoading(true);
    try {
      await setPasswordAndName(password, displayName);
      router.replace('/');
    } catch (err) {
      Alert.alert('Could not finish setup', err instanceof Error ? err.message : 'Try again.');
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
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </TouchableOpacity>

          {step === 'email' && (
            <>
              <Text style={styles.title}>Join your team</Text>
              <Text style={styles.subtitle}>
                Enter the email your invitation was sent to. We’ll email you a
                one-time code.
              </Text>
              <View style={styles.form}>
                <Input
                  placeholder="you@company.com"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  returnKeyType="done"
                  onSubmitEditing={handleSendCode}
                />
              </View>
              <Button title="Send code" onPress={handleSendCode} loading={loading} />
            </>
          )}

          {step === 'code' && (
            <>
              <Text style={styles.title}>Enter your code</Text>
              <Text style={styles.subtitle}>
                We sent a 6-digit code to {email}. Enter it below.
              </Text>
              <View style={styles.form}>
                <Input
                  placeholder="123456"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={6}
                  returnKeyType="done"
                  onSubmitEditing={handleVerify}
                />
              </View>
              <Button title="Verify" onPress={handleVerify} loading={loading} />
              <TouchableOpacity style={styles.resend} onPress={handleSendCode} disabled={loading}>
                <Text style={styles.resendText}>Resend code</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'profile' && (
            <>
              <Text style={styles.title}>Set up your account</Text>
              <Text style={styles.subtitle}>
                Add your name and choose a strong password to finish.
              </Text>
              <View style={styles.form}>
                <Input
                  placeholder="Your name"
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
                <Input
                  placeholder="Password (min 8 characters)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={handleFinish}
                />
                <PasswordStrengthMeter password={password} />
              </View>
              <Button title="Finish" onPress={handleFinish} loading={loading} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 24, paddingBottom: 32 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 20 },
  backBtnText: { fontSize: 16, color: theme.colors.textMuted, fontWeight: '500' },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: { fontSize: 15, color: theme.colors.textMuted, lineHeight: 22, marginBottom: 28 },
  form: { gap: 2, marginBottom: 12 },
  resend: { alignItems: 'center', paddingVertical: 12 },
  resendText: { fontSize: 14, color: theme.colors.primary, fontWeight: '600' },
});
