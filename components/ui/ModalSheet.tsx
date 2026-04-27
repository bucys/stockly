import { ReactNode } from 'react';
import {
  Modal,
  Pressable,
  KeyboardAvoidingView,
  ScrollView,
  View,
  StyleSheet,
  Platform,
  Keyboard,
  ViewStyle,
} from 'react-native';
import { theme } from '@/constants/theme';

interface ModalSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  scrollable?: boolean;
  maxHeight?: number | `${number}%`;
  avoidKeyboard?: boolean;
  sheetStyle?: ViewStyle;
}

export function ModalSheet({
  visible,
  onClose,
  children,
  scrollable = false,
  maxHeight,
  avoidKeyboard = true,
  sheetStyle,
}: ModalSheetProps) {
  function handleClose() {
    Keyboard.dismiss();
    onClose();
  }

  const sheetContent = scrollable ? (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.sheetContent}>{children}</View>
  );

  const sheet = (
    <Pressable
      style={[
        styles.sheetBase,
        maxHeight ? { maxHeight } : undefined,
        sheetStyle,
      ]}
      onPress={() => {}}
    >
      <View style={styles.handle} />
      {sheetContent}
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      {avoidKeyboard ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.overlay} onPress={handleClose}>
            {sheet}
          </Pressable>
        </KeyboardAvoidingView>
      ) : (
        <Pressable style={styles.overlay} onPress={handleClose}>
          {sheet}
        </Pressable>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetBase: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xxl,
    borderTopRightRadius: theme.radius.xxl,
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDDDD8',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetContent: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: 48,
    paddingTop: 4,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: 88,
    paddingTop: 4,
  },
});
