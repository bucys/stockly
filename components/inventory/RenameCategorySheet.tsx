import { Text } from 'react-native';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { sheetStyles } from './sheetStyles';

interface Props {
  visible: boolean;
  value: string;
  saving: boolean;
  onChangeText: (text: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export function RenameCategorySheet({
  visible,
  value,
  saving,
  onChangeText,
  onSave,
  onClose,
}: Props) {
  return (
    <ModalSheet visible={visible} onClose={onClose} scrollable maxHeight="90%">
      <Text style={sheetStyles.sheetTitle}>Rename category</Text>
      <Input
        placeholder="Category name"
        value={value}
        onChangeText={onChangeText}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={onSave}
      />
      <Button title="Save" onPress={onSave} loading={saving} disabled={!value.trim()} />
      <Button title="Cancel" onPress={onClose} variant="ghost" />
    </ModalSheet>
  );
}
