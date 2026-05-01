import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({
  name,
  focusedName,
  focused,
  color,
}: {
  name: IconName;
  focusedName: IconName;
  focused: boolean;
  color: string;
}) {
  return <Ionicons name={focused ? focusedName : name} size={23} color={color} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textLight,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.borderLight,
          borderTopWidth: 1,
          paddingTop: 6,
          height: 62,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: 6,
        },
        // Tabs navigator shows its own header for tab screens
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.primary,
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 20,
          color: theme.colors.text,
        },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Stockly',
          tabBarLabel: 'Locations',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="home-outline" focusedName="home" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          title: 'Sessions',
          tabBarLabel: 'Sessions',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="time-outline" focusedName="time" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="person-outline" focusedName="person" focused={focused} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
