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
  keyboardVerticalOffset?: number;
}

export function ModalSheet({
  visible,
  onClose,
  children,
  scrollable = false,
  maxHeight,
  avoidKeyboard = true,
  sheetStyle,
  keyboardVerticalOffset = 0,
}: ModalSheetProps) {
  function handleClose() {
    Keyboard.dismiss();
    onClose();
  }

  const sheetContent = scrollable ? (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      bounces={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.sheetContent}>{children}</View>
  );

  const sheet = (
    <Pressable
      style={[styles.sheetBase, maxHeight ? { maxHeight } : undefined, sheetStyle]}
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
          keyboardVerticalOffset={keyboardVerticalOffset}
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
    backgroundColor: theme.colors.backdrop,
  },
  sheetBase: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xxl,
    borderTopRightRadius: theme.radius.xxl,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.borderLight,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetContent: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: 120,
    paddingTop: 2,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: 120,
    paddingTop: 2,
  },
});
