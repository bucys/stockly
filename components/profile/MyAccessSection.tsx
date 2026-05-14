import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { profileStyles } from './styles';
import type { Location } from '@/services/locations';

const MAX_VISIBLE = 3;

interface Props {
  assignedIds: Set<string> | null;
  assignedLoading: boolean;
  locations: Location[];
  onRequestAccess: () => void;
}

export function MyAccessSection({
  assignedIds,
  assignedLoading,
  locations,
  onRequestAccess,
}: Props) {
  const assignedLocations =
    assignedIds == null
      ? locations
      : locations.filter((l) => assignedIds.has(l.id));
  const visible = assignedLocations.slice(0, MAX_VISIBLE);
  const remaining = assignedLocations.length - visible.length;
  const isLoading = assignedLoading && assignedLocations.length === 0;
  const hasAccess = !isLoading && assignedLocations.length > 0;

  return (
    <>
      <Text style={profileStyles.sectionTitle}>My access</Text>
      <View style={profileStyles.group}>
        {isLoading ? (
          <View style={profileStyles.row}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : hasAccess ? (
          <>
            {visible.map((loc, idx) => (
              <View
                key={loc.id}
                style={[
                  profileStyles.row,
                  (idx < visible.length - 1 || remaining > 0) && profileStyles.rowDivider,
                ]}
              >
                <Text style={profileStyles.rowLabel} numberOfLines={1}>
                  {loc.name}
                </Text>
              </View>
            ))}
            {remaining > 0 && (
              <View style={[profileStyles.row, profileStyles.rowDivider]}>
                <Text style={profileStyles.rowSubInline}>+{remaining} more</Text>
              </View>
            )}
            <TouchableOpacity
              style={profileStyles.row}
              onPress={onRequestAccess}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={[profileStyles.rowLabel, { color: theme.colors.primary }]}>
                  Request access
                </Text>
                <Text style={profileStyles.rowSub}>Ask an admin for another location</Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={theme.colors.textLight} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={[profileStyles.row, profileStyles.rowDivider]}>
              <View style={{ flex: 1 }}>
                <Text style={profileStyles.rowLabel}>No locations assigned</Text>
                <Text style={profileStyles.rowSub}>Ask your admin for access</Text>
              </View>
            </View>
            <TouchableOpacity
              style={profileStyles.row}
              onPress={onRequestAccess}
              activeOpacity={0.7}
            >
              <Text style={[profileStyles.rowLabel, { color: theme.colors.primary }]}>
                Request access
              </Text>
              <Ionicons name="chevron-forward" size={15} color={theme.colors.textLight} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </>
  );
}
