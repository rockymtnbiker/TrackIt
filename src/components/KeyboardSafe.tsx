import { HeaderHeightContext } from '@react-navigation/elements';
import { useContext, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = {
  children: ReactNode;
  /**
   * Distance from the top of the screen to this view.
   * Stack screens default to the navigation header height when that context exists.
   */
  keyboardVerticalOffset?: number;
  /**
   * Expo edge-to-edge Android keeps the window full height, so `padding` is the
   * behavior that lifts a screen. Other screens keep the previous default.
   */
  behavior?: 'height' | 'padding' | 'position';
  style?: StyleProp<ViewStyle>;
};

export function KeyboardSafe({
  children,
  keyboardVerticalOffset,
  behavior,
  style,
}: Props) {
  const headerHeight = useContext(HeaderHeightContext);
  const offset = keyboardVerticalOffset ?? headerHeight ?? 0;
  const resolved = behavior ?? (Platform.OS === 'ios' ? 'padding' : 'height');

  return (
    <KeyboardAvoidingView
      style={[styles.fill, style]}
      behavior={resolved}
      keyboardVerticalOffset={offset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
