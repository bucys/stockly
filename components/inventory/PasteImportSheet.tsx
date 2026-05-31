import { Text, TextInput, StyleSheet } from 'react-native';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { Button } from '@/components/ui/Button';
import { theme } from '@/constants/theme';
import { sheetStyles } from './sheetStyles';

interface Props {
  visible: boolean;
  value: string;
  onChangeText: (text: string) => void;
  onParse: () => void;
  onClose: () => void;
}

export function PasteImportSheet({ visible, value, onChangeText, onParse, onClose }: Props) {
  return (
    <ModalSheet visible={visible} onClose={onClose} scrollable maxHeight="90%">
      <Text style={sheetStyles.sheetTitle}>Import from text</Text>
      <Text style={sheetStyles.pasteHint}>
        One product per line: name, category, unit, qty (optional).{'\n'}
        Delimiters: comma, semicolon, or tab.{'\n'}
        Use semicolon or tab if your quantities use decimal commas, e.g. 1,5
      </Text>
      <TextInput
        style={styles.pasteArea}
        value={value}
        onChangeText={onChangeText}
        placeholder={'Coca-Cola, Drinks, bottle, 12\nMilk; Dairy; l; 20'}
        placeholderTextColor={theme.colors.textPlaceholder}
        multiline
        autoCorrect={false}
        autoCapitalize="none"
        textAlignVertical="top"
      />
      <Button title="Parse" onPress={onParse} disabled={value.trim() === ''} />
      <Button title="Cancel" onPress={onClose} variant="ghost" />
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  pasteArea: {
    minHeight: 180,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: theme.colors.inputBg,
    marginBottom: theme.spacing.md,
  },
});
