import { Text, StyleSheet, Keyboard } from 'react-native';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { theme } from '@/constants/theme';

interface Props {
  visible: boolean;
  draft: string;
  saving: boolean;
  onChangeDraft: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export function DisplayNameSheet({
  visible,
  draft,
  saving,
  onChangeDraft,
  onSave,
  onClose,
}: Props) {
  function handleSave() {
    Keyboard.dismiss();
    onSave();
  }

  function handleClose() {
    Keyboard.dismiss();
    onClose();
  }

  return (
    <ModalSheet
      visible={visible}
      onClose={() => !saving && handleClose()}
      avoidKeyboard
      scrollable
      maxHeight="60%"
    >
      <Text style={styles.editorTitle}>Edit display name</Text>
      <Text style={styles.editorSub}>
        Leave empty to clear — your email will be shown instead.
      </Text>
      <Input
        placeholder="Display name"
        value={draft}
        onChangeText={onChangeDraft}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSave}
      />
      <Button title="Save" onPress={handleSave} loading={saving} />
      <Button title="Cancel" onPress={handleClose} variant="ghost" />
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  editorTitle: { fontSize: 19, fontWeight: '700', color: theme.colors.text, marginBottom: 6 },
  editorSub: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 16 },
});
