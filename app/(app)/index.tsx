import { Redirect } from 'expo-router';

// Locations screen has moved to (tabs)/index.tsx.
// This redirect ensures any navigation to /(app) lands on the tabs.
export default function AppIndex() {
  return <Redirect href="/(app)/(tabs)" />;
}
