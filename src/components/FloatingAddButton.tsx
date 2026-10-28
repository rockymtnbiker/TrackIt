import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useContext } from 'react';
import { Pressable, StyleSheet } from 'react-native';

export const FLOATING_ADD_BUTTON_SIZE = 56;
/** List padding so the last row clears the button. */
export const FLOATING_ADD_BUTTON_CLEARANCE = FLOATING_ADD_BUTTON_SIZE + 32;

type Props = {
  onPress: () => void;
  accessibilityLabel?: string;
};

export function FloatingAddButton({
  onPress,
  accessibilityLabel = 'Add goal',
}: Props) {
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  // These screens sit in the tab scene, which already ends at the in-flow bar.
  // A bottom-tab navigator reports its height because the scene draws under it.
  const bottom = 16 + (tabBarHeight ?? 0);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.button,
        { bottom },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name="add" size={32} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 16,
    width: FLOATING_ADD_BUTTON_SIZE,
    height: FLOATING_ADD_BUTTON_SIZE,
    borderRadius: FLOATING_ADD_BUTTON_SIZE / 2,
    backgroundColor: '#007aff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  pressed: {
    opacity: 0.85,
  },
});
