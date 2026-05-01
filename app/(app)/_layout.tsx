import { Stack } from 'expo-router';
import { theme } from '@/constants/theme';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.primary,
        headerTitleStyle: { fontWeight: '600', color: theme.colors.text },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      {/* Tab screens manage their own header via the Tabs navigator */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="locations/[locationId]/index" />
      <Stack.Screen name="locations/[locationId]/sessions/index" />
      <Stack.Screen name="locations/[locationId]/sessions/[sessionId]" />
    </Stack>
  );
}
