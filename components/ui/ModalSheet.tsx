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
  /**
   * Extra bottom padding inside the sheet content. Default is small (24) so
   * forms don't leave a tall blank area below inputs when the keyboard is
   * open. Use a larger value only for sheets where content sits above
   * persistent overlays (FAB, tab bar, etc.).
   */
  contentBottomPadding?: number;
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
  contentBottomPadding = 24,
}: ModalSheetProps) {
  function handleClose() {
    Keyboard.dismiss();
    onClose();
  }

  const sheetContent = scrollable ? (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      // The outer KeyboardAvoidingView already lifts the sheet above the
      // keyboard. Adding automaticallyAdjustKeyboardInsets on top stacks a
      // second keyboard-sized inset and creates a scrollable blank area
      // under short forms.
      automaticallyAdjustKeyboardInsets={false}
      bounces={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.sheetContent, { paddingBottom: contentBottomPadding }]}>
      {children}
    </View>
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
    paddingTop: 2,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: 2,
  },
});
