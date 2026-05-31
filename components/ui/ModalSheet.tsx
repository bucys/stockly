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
  /**
   * Make the sheet fill its `maxHeight` and let the children own the internal
   * layout (e.g. a fixed header, a flexible scroll area, and a sticky footer).
   * The children are rendered in a `flex: 1` column instead of the default
   * single ScrollView. Ignored when `scrollable` is true.
   */
  fillHeight?: boolean;
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
  fillHeight = false,
}: ModalSheetProps) {
  function handleClose() {
    Keyboard.dismiss();
    onClose();
  }

  let sheetContent;
  if (scrollable) {
    sheetContent = (
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
    );
  } else if (fillHeight) {
    // Children own the internal layout (header / scroll / sticky footer).
    sheetContent = <View style={styles.sheetContentFill}>{children}</View>;
  } else {
    sheetContent = (
      <View style={[styles.sheetContent, { paddingBottom: contentBottomPadding }]}>
        {children}
      </View>
    );
  }

  const sheet = (
    <Pressable
      style={[
        styles.sheetBase,
        maxHeight ? { maxHeight } : undefined,
        fillHeight ? styles.sheetFill : undefined,
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
  // Combined with `maxHeight`, flexGrow turns the sheet into a concrete-height
  // box so a `flex: 1` child (e.g. a scroll area) can be bounded and a footer
  // can stay pinned below it.
  sheetFill: {
    flexGrow: 1,
    overflow: 'hidden',
  },
  sheetContentFill: {
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: 2,
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
