import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useReflectTheme } from '../constants/reflectTheme';
import { useFloatingTabBarHeight } from '../navigation/FloatingTabBar';

/** One solid action pinned at the bottom of a reflection screen. */
export function ReflectMayaBar({
  label,
  onPress,
  secondaryLabel,
  onSecondary,
  inset,
}: {
  label: string;
  onPress: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Space under the bar. Defaults to the floating tab pill. Pass 0 when a parent docks it. */
  inset?: number;
}) {
  const theme = useReflectTheme();
  const tabBarHeight = useFloatingTabBarHeight();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.accentSoft,
          borderTopColor: theme.accent,
          marginBottom: inset ?? tabBarHeight,
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.primary, { backgroundColor: theme.accent }, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={styles.primaryText}>{label}</Text>
      </Pressable>
      {secondaryLabel && onSecondary ? (
        <Pressable
          onPress={onSecondary}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel}
        >
          <Text style={[styles.secondaryText, { color: theme.accent }]}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  primary: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  primaryText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  secondary: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  secondaryText: {
    fontSize: 17,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
});
