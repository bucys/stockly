import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { theme } from '@/constants/theme';

function LogoMark() {
  return (
    <View style={styles.logoOuter}>
      <View style={styles.logoGrid}>
        <View style={styles.logoRow}>
          <View style={styles.logoDot} />
          <View style={styles.logoDot} />
        </View>
        <View style={styles.logoRow}>
          <View style={styles.logoDot} />
          <View style={styles.logoDot} />
        </View>
      </View>
    </View>
  );
}

export default function WelcomeScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.root}>
        <View style={styles.header} />

        <View style={styles.content}>
          <LogoMark />
          <Text style={styles.appName}>Stockly</Text>
          <Text style={styles.tagline}>
            Fast, simple inventory counting{'\n'}for your team.
          </Text>
        </View>

        <View style={styles.footer}>
          <Button
            title="Get started"
            onPress={() => router.push('/(auth)/login')}
            style={styles.footerBtn}
          />
          <Button
            title="I have a join code"
            variant="outline"
            onPress={() => router.push('/(auth)/join')}
            style={styles.footerBtnLast}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  root: {
    flex: 1,
  },
  header: {
    minHeight: 24,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoOuter: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  logoGrid: {
    gap: 5,
  },
  logoRow: {
    flexDirection: 'row',
    gap: 5,
  },
  logoDot: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 17,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 26,
  },
  footer: {
    paddingHorizontal: 28,
    paddingBottom: 16,
  },
  footerBtn: {
    marginBottom: 12,
  },
  footerBtnLast: {
    marginBottom: 24,
  },
});
