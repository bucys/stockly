import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { Button } from '@/components/ui/Button';
import { theme } from '@/constants/theme';
import { sheetStyles } from './sheetStyles';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCopyFromLocation: () => void;
  onImportFromText: () => void;
  onImportFromFile: () => void;
}

export function ImportOptionsSheet({
  visible,
  onClose,
  onCopyFromLocation,
  onImportFromText,
  onImportFromFile,
}: Props) {
  return (
    <ModalSheet visible={visible} onClose={onClose} scrollable maxHeight="70%">
      <Text style={sheetStyles.sheetTitle}>Import products</Text>

      <TouchableOpacity style={styles.importMenuRow} onPress={onCopyFromLocation} activeOpacity={0.7}>
        <Ionicons name="copy-outline" size={20} color={theme.colors.text} />
        <View style={styles.importMenuTextWrap}>
          <Text style={styles.importMenuTitle}>Copy from another location</Text>
          <Text style={styles.importMenuSub}>
            Reuse categories and products from a sibling location.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textLight} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.importMenuRow} onPress={onImportFromText} activeOpacity={0.7}>
        <Ionicons name="document-text-outline" size={20} color={theme.colors.text} />
        <View style={styles.importMenuTextWrap}>
          <Text style={styles.importMenuTitle}>Import from text</Text>
          <Text style={styles.importMenuSub}>Paste comma, semicolon, or tab-separated rows.</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textLight} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.importMenuRow} onPress={onImportFromFile} activeOpacity={0.7}>
        <Ionicons name="document-outline" size={20} color={theme.colors.text} />
        <View style={styles.importMenuTextWrap}>
          <Text style={styles.importMenuTitle}>Import from File</Text>
          <Text style={styles.importMenuSub}>CSV, XLSX or PDF.</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textLight} />
      </TouchableOpacity>

      <Button title="Cancel" onPress={onClose} variant="ghost" />
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  importMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  importMenuTextWrap: { flex: 1 },
  importMenuTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  importMenuSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
});
