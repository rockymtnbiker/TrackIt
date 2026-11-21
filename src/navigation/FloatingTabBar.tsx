import { BlurView } from 'expo-blur';
import { CommonActions } from '@react-navigation/native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Capsule height. Icon, label, and the Connect badge fit inside it. */
export const FLOATING_TAB_PILL_HEIGHT = 64;
/** Space between the capsule and the screen edges. */
export const FLOATING_TAB_EDGE = 16;
/** Space between the capsule and the home indicator. */
export const FLOATING_TAB_GAP = 8;

/** Pill plus the gap above the home indicator. Screens pad by this much. */
export function floatingTabBarHeight(bottomInset: number): number {
  return FLOATING_TAB_PILL_HEIGHT + FLOATING_TAB_GAP + bottomInset;
}

const FloatingTabBarHeightContext = createContext(0);

/** Present only around the tab pager, so screens outside the tabs add nothing. */
export function FloatingTabBarHeightProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <FloatingTabBarHeightContext.Provider value={floatingTabBarHeight(insets.bottom)}>
      {children}
    </FloatingTabBarHeightContext.Provider>
  );
}

export function useFloatingTabBarHeight(): number {
  return useContext(FloatingTabBarHeightContext);
}

type Props = Omit<BottomTabBarProps, 'insets'> & {
  /** Fractional page index, updated while the pager scrolls. */
  progress: SharedValue<number>;
};

/**
 * iOS-style floating capsule. It sits over the pager, so the pages draw behind it.
 * Hidden while the keyboard is open so it does not ride up with the window.
 */
export function FloatingTabBar({ state, navigation, descriptors, progress }: Props) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const tabWidth = useSharedValue(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const highlightStyle = useAnimatedStyle(() => ({
    width: Math.max(0, tabWidth.value - 8),
    opacity: tabWidth.value > 0 ? 1 : 0,
    transform: [{ translateX: progress.value * tabWidth.value + 4 }],
  }));

  if (keyboardOpen) {
    return null;
  }

  const fallback = dark ? 'rgba(28,28,30,0.78)' : 'rgba(245,245,247,0.78)';
  const border = dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.7)';
  const highlight = dark ? 'rgba(255,255,255,0.16)' : 'rgba(120,120,128,0.16)';

  return (
    <View pointerEvents="box-none" style={[styles.anchor, { bottom: insets.bottom + FLOATING_TAB_GAP }]}>
      <View style={styles.shadow}>
        <View
          style={[styles.pill, { borderColor: border }]}
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            tabWidth.value = state.routes.length > 0 ? width / state.routes.length : 0;
          }}
        >
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fallback }]} />
          <BlurView
            pointerEvents="none"
            intensity={80}
            tint={dark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            pointerEvents="none"
            style={[styles.highlight, { backgroundColor: highlight }, highlightStyle]}
          />
          <View style={styles.row}>
            {state.routes.map((route, index) => {
              const { options } = descriptors[route.key];
              const focused = state.index === index;
              const color = focused
                ? (options.tabBarActiveTintColor ?? '#007AFF')
                : (options.tabBarInactiveTintColor ?? '#8E8E93');
              const rawLabel = options.tabBarLabel;
              const label = typeof rawLabel === 'string' ? rawLabel : (options.title ?? route.name);
              const accessibilityLabel =
                options.tabBarAccessibilityLabel ??
                (Platform.OS === 'ios' ? `${label}, tab, ${index + 1} of ${state.routes.length}` : label);
              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={accessibilityLabel}
                  onPress={() => {
                    const event = navigation.emit({
                      type: 'tabPress',
                      target: route.key,
                      canPreventDefault: true,
                    });
                    if (focused || event.defaultPrevented) {
                      return;
                    }
                    navigation.dispatch({
                      ...CommonActions.navigate(route.name),
                      target: state.key,
                    });
                  }}
                  onLongPress={() => {
                    navigation.emit({ type: 'tabLongPress', target: route.key });
                  }}
                  style={styles.tab}
                >
                  {options.tabBarIcon?.({ focused, color, size: 24 })}
                  <Text style={[styles.label, { color }]} numberOfLines={1}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: FLOATING_TAB_EDGE,
    right: FLOATING_TAB_EDGE,
    zIndex: 20,
  },
  shadow: {
    borderRadius: FLOATING_TAB_PILL_HEIGHT / 2,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  pill: {
    height: FLOATING_TAB_PILL_HEIGHT,
    borderRadius: FLOATING_TAB_PILL_HEIGHT / 2,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  highlight: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 999,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
  },
});
