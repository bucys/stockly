import { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { signUp } from '@/services/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { theme } from '@/constants/theme';
import { PlanPicker, planCtaLabel, type PlanId } from '@/components/auth/PlanPicker';
import { OnboardingHeader } from '@/components/auth/OnboardingHeader';

type Step = 'details' | 'plan';

export default function RegisterScreen() {
  const [step, setStep] = useState<Step>('details');
  const [companyName, setCompanyName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('free');
  const [loading, setLoading] = useState(false);

  const fade = useRef(new Animated.Value(1)).current;

  function transitionTo(next: Step) {
    Animated.timing(fade, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      setStep(next);
      Animated.timing(fade, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
    });
  }

  function handleContinue() {
    if (!displayName.trim()) {
      Alert.alert('Missing name', 'Please enter your name.');
      return;
    }
    if (!companyName || !email || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    transitionTo('plan');
  }

  async function handleRegister() {
    setLoading(true);
    try {
      // selectedPlan is captured client-side only — billing/limits are not
      // enabled yet. signUp's existing signature is preserved.
      await signUp(email.trim(), password, companyName.trim(), displayName.trim());
      Alert.alert(
        'Account created',
        'Check your email to confirm your account, then sign in.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }],
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      Alert.alert('Registration failed', message);
    } finally {
      setLoading(false);
    }
  }

  function onBack() {
    if (step === 'plan') {
      transitionTo('details');
      return;
    }
    router.back();
  }

  const isDetails = step === 'details';

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
          <OnboardingHeader
            step={isDetails ? 0 : 1}
            total={2}
            onBack={onBack}
            title={isDetails ? 'Create your workspace' : 'Choose your plan'}
            subtitle={
              isDetails
                ? 'Set up your company and start inventory tracking.'
                : 'You can change plans later.'
            }
          />

          <Animated.View style={[styles.stepBody, { opacity: fade }]}>
            {isDetails ? (
              <>
                <View style={styles.form}>
                  <Input
                    placeholder="Company name"
                    value={companyName}
                    onChangeText={setCompanyName}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                  <Input
                    placeholder="Your name"
                    value={displayName}
                    onChangeText={setDisplayName}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                  <Input
                    placeholder="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    returnKeyType="next"
                  />
                  <Input
                    placeholder="Password (min 6 characters)"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete="new-password"
                    returnKeyType="done"
                    onSubmitEditing={handleContinue}
                  />
                </View>

                <View style={styles.footer}>
                  <Button
                    title="Continue"
                    onPress={handleContinue}
                    style={{ marginBottom: 0 }}
                  />
                  <TouchableOpacity
                    onPress={() => router.replace('/(auth)/login')}
                    style={styles.loginLink}
                  >
                    <Text style={styles.loginLinkText}>
                      Already have an account?{' '}
                      <Text style={styles.loginLinkAccent}>Log in</Text>
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <PlanPicker selected={selectedPlan} onSelect={setSelectedPlan} />
                <View style={styles.footer}>
                  <Button
                    title={planCtaLabel(selectedPlan)}
                    onPress={handleRegister}
                    loading={loading}
                    style={{ marginBottom: 0 }}
                  />
                  <Text style={styles.billingNote}>
                    Billing is not enabled yet.
                  </Text>
                </View>
              </>
            )}
          </Animated.View>
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
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  stepBody: { flex: 1 },
  form: { gap: 10, marginBottom: 28 },
  footer: { gap: 8, marginTop: 4 },
  loginLink: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  loginLinkText: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  loginLinkAccent: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  billingNote: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
});
