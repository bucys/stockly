import { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { profileStyles } from './styles';

interface Props {
  label: string;
  /** Right-aligned secondary text (used like a settings value). */
  value?: string | null;
  /** Renders the value with the "empty" muted style. */
  valueIsEmpty?: boolean;
  /** Single-line subtitle under the label. */
  sub?: string;
  /** Override the label color (e.g. primary for "Request access"). */
  labelColor?: string;
  onPress?: () => void;
  disabled?: boolean;
  /** When false, no chevron is rendered. Default true if onPress is set. */
  showChevron?: boolean;
  /** Extra content placed in the right slot (replaces chevron when present). */
  accessory?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ProfileRow({
  label,
  value,
  valueIsEmpty,
  sub,
  labelColor,
  onPress,
  disabled,
  showChevron,
  accessory,
  style,
}: Props) {
  const renderChevron = (showChevron ?? !!onPress) && !accessory;
  const body = (
    <>
      <View style={{ flex: 1 }}>
        <Text style={[profileStyles.rowLabel, labelColor ? { color: labelColor } : null]}>
          {label}
        </Text>
        {sub ? <Text style={profileStyles.rowSub}>{sub}</Text> : null}
      </View>
      {value != null && (
        <View style={profileStyles.rowRight}>
          <Text
            style={[
              profileStyles.rowValue,
              valueIsEmpty && profileStyles.rowValueEmpty,
            ]}
            numberOfLines={1}
          >
            {value}
          </Text>
        </View>
      )}
      {accessory}
      {renderChevron && (
        <Ionicons name="chevron-forward" size={15} color={theme.colors.textLight} />
      )}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[profileStyles.row, style]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.7}
      >
        {body}
      </TouchableOpacity>
    );
  }
  return <View style={[profileStyles.row, style]}>{body}</View>;
}
