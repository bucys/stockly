import { Text } from 'react-native';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { Button } from '@/components/ui/Button';
import { sheetStyles } from './sheetStyles';

interface Props {
  visible: boolean;
  picking: boolean;
  onChooseCsv: () => void;
  onChooseXlsx: () => void;
  onClose: () => void;
}

export function ImportFileSheet({ visible, picking, onChooseCsv, onChooseXlsx, onClose }: Props) {
  return (
    <ModalSheet
      visible={visible}
      onClose={() => {
        if (picking) return;
        onClose();
      }}
      scrollable
      maxHeight="60%"
    >
      <Text style={sheetStyles.sheetTitle}>Import File</Text>
      <Text style={sheetStyles.pasteHint}>
        Choose a file to import products.{'\n'}
        Expected columns: name, category, unit, qty (optional).
      </Text>
      <Button
        title={picking ? 'Opening…' : 'Choose CSV file'}
        onPress={onChooseCsv}
        disabled={picking}
      />
      <Button
        title={picking ? 'Opening…' : 'Choose XLSX file'}
        onPress={onChooseXlsx}
        disabled={picking}
      />
      <Button title="Choose PDF file (coming soon)" onPress={() => {}} disabled />
      <Button title="Cancel" onPress={onClose} variant="ghost" disabled={picking} />
    </ModalSheet>
  );
}
