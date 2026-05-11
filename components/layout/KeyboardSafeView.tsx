import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleProp,
  ViewStyle,
} from 'react-native';

/**
 * KeyboardSafeView
 *
 * Thin reusable wrapper around KeyboardAvoidingView with safe defaults for
 * iOS + Android. Use this on full-screen form views that contain text inputs.
 *
 * IMPORTANT — keep this component minimal:
 *   - No internal ScrollView, no flexGrow, no default bottom padding. Adding
 *     any of those tends to compound with the keyboard inset and produces
 *     huge blank scroll areas under the form (the exact bug we've already
 *     hit and fixed elsewhere).
 *   - On Android, `padding` typically over-corrects when the OS already
 *     resizes the window via `windowSoftInputMode=adjustResize`, so we leave
 *     `behavior` undefined and let the system handle it.
 *   - Do NOT nest this inside ModalSheet — ModalSheet already wraps its
 *     content in a KeyboardAvoidingView. Two stacked offsets cause double
 *     padding.
 *
 * If a screen needs a scrollable form, place a ScrollView *inside*
 * KeyboardSafeView and choose its own paddingBottom explicitly (small —
 * 16–32 is usually enough; the keyboard inset is added automatically on
 * iOS via automaticallyAdjustKeyboardInsets).
 */
interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
}

export function KeyboardSafeView({
  children,
  style,
  keyboardVerticalOffset = 0,
}: Props) {
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
