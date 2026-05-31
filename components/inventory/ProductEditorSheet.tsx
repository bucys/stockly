import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { theme } from '@/constants/theme';
import { sheetStyles } from './sheetStyles';

interface Props {
  visible: boolean;
  isEditing: boolean;
  name: string;
  onChangeName: (text: string) => void;
  categoryText: string;
  onChangeCategoryText: (text: string) => void;
  categorySuggestions: string[];
  onSelectSuggestion: (suggestion: string) => void;
  showCreateHint: boolean;
  createHintName: string;
  units: readonly string[];
  unit: string;
  onSelectUnit: (unit: string) => void;
  lastQty: string;
  onChangeLastQty: (text: string) => void;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}

export function ProductEditorSheet({
  visible,
  isEditing,
  name,
  onChangeName,
  categoryText,
  onChangeCategoryText,
  categorySuggestions,
  onSelectSuggestion,
  showCreateHint,
  createHintName,
  units,
  unit,
  onSelectUnit,
  lastQty,
  onChangeLastQty,
  saving,
  onSave,
  onClose,
}: Props) {
  return (
    <ModalSheet visible={visible} onClose={onClose} scrollable maxHeight="90%">
      <Text style={sheetStyles.sheetTitle}>{isEditing ? 'Edit product' : 'New product'}</Text>

      <Text style={sheetStyles.fieldLabel}>Name</Text>
      <Input placeholder="Product name" value={name} onChangeText={onChangeName} autoFocus />

      <Text style={sheetStyles.fieldLabel}>Category</Text>
      <TextInput
        style={styles.categoryInput}
        placeholder="Type to find or create…"
        placeholderTextColor={theme.colors.textPlaceholder}
        value={categoryText}
        onChangeText={onChangeCategoryText}
        autoCorrect={false}
        autoCapitalize="words"
        returnKeyType="done"
      />
      {categorySuggestions.length > 0 && (
        <View style={styles.suggestionsWrap}>
          {categorySuggestions.map((s) => (
            <TouchableOpacity
              key={s}
              style={styles.suggestionChip}
              onPress={() => onSelectSuggestion(s)}
              activeOpacity={0.7}
            >
              <Text style={styles.suggestionChipText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {showCreateHint && (
        <Text style={styles.suggestionHint}>Will create new category "{createHintName}"</Text>
      )}

      <Text style={sheetStyles.fieldLabel}>Unit</Text>
      <View style={sheetStyles.chipsWrap}>
        {units.map((u) => (
          <TouchableOpacity
            key={u}
            style={[sheetStyles.chip, unit === u && sheetStyles.chipSelected]}
            onPress={() => onSelectUnit(u)}
          >
            <Text style={[sheetStyles.chipText, unit === u && sheetStyles.chipTextSelected]}>
              {u}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={sheetStyles.fieldLabel}>Last known quantity (optional)</Text>
      <Input
        placeholder="e.g. 50"
        value={lastQty}
        onChangeText={onChangeLastQty}
        keyboardType="decimal-pad"
      />

      <Button
        title="Save"
        onPress={onSave}
        loading={saving}
        disabled={!name.trim() || !categoryText.trim()}
      />
      <Button title="Cancel" onPress={onClose} variant="ghost" />
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  categoryInput: {
    height: 48,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: 8,
  },
  suggestionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  suggestionChipText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  suggestionHint: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: 18,
    fontStyle: 'italic',
  },
});
