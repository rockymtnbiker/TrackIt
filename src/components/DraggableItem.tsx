import { createContext, useContext, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export const DEFAULT_DRAGGABLE_ITEM_HEIGHT = 52;
export const LONG_PRESS_MS = 400;

type DragRelations = {
  pan: RefObject<GestureType | undefined>;
  tap: RefObject<GestureType | undefined>;
};

// Nested rows block the ancestor drag so a long-press on a sub-step
// reorders that sibling group instead of the parent branch.
const OuterDragContext = createContext<DragRelations | null>(null);

type Props = {
  index: number;
  /** Used to convert drag distance into an index delta on release. */
  itemHeight?: number;
  enabled?: boolean;
  /** Short tap (not used when a long-press drag activates). */
  onPress?: () => void;
  onDragStart: () => void;
  onDragMove: (dy: number) => void;
  onDragEnd: (fromIndex: number, toIndex: number, dy: number) => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function DraggableItem({
  index,
  itemHeight = DEFAULT_DRAGGABLE_ITEM_HEIGHT,
  enabled = true,
  onPress,
  onDragStart,
  onDragMove,
  onDragEnd,
  children,
  style,
}: Props) {
  const indexRef = useRef(index);
  indexRef.current = index;
  const itemHeightRef = useRef(itemHeight);
  itemHeightRef.current = itemHeight;

  const dragSessionRef = useRef(false);

  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;
  const onDragMoveRef = useRef(onDragMove);
  onDragMoveRef.current = onDragMove;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  const translateY = useSharedValue(0);
  const lifted = useSharedValue(0);
  const outerDrag = useContext(OuterDragContext);
  const panRef = useRef<GestureType | undefined>(undefined);
  const tapRef = useRef<GestureType | undefined>(undefined);
  const dragRelations = useRef<DragRelations>({ pan: panRef, tap: tapRef });

  const beginDrag = () => {
    dragSessionRef.current = true;
    onDragStartRef.current();
  };

  const moveDrag = (dy: number) => {
    onDragMoveRef.current(dy);
  };

  const endDrag = (dy: number) => {
    if (!dragSessionRef.current) {
      return;
    }
    dragSessionRef.current = false;
    const fromIndex = indexRef.current;
    const toIndex = Math.max(
      0,
      fromIndex + Math.round(dy / itemHeightRef.current),
    );
    onDragEndRef.current(fromIndex, toIndex, dy);
  };

  const handlePress = () => {
    onPressRef.current?.();
  };

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activateAfterLongPress(LONG_PRESS_MS)
      // A sideways move before the long-press activates belongs to the tab
      // pager, not this reorder gesture.
      .failOffsetX([-48, 48])
      .enabled(enabled)
      .onStart(() => {
        // Set immediately so zIndex/elevation kick in before the first frame.
        lifted.value = 1;
        beginDrag();
      })
      .onUpdate((event) => {
        translateY.value = event.translationY;
        moveDrag(event.translationY);
      })
      .onEnd((event) => {
        endDrag(event.translationY);
        translateY.value = withTiming(0, { duration: 120 });
        lifted.value = withTiming(0, { duration: 120 });
      })
      .onFinalize((_event, success) => {
        if (!success) {
          endDrag(0);
          translateY.value = withTiming(0, { duration: 120 });
          lifted.value = withTiming(0, { duration: 120 });
        }
      });
    panRef.current = pan;
    if (outerDrag) {
      pan.blocksExternalGesture(outerDrag.pan, outerDrag.tap);
    }

    if (!onPress) {
      tapRef.current = undefined;
      return pan;
    }

    // Pan is listed first so a successful long-press drag cancels the tap.
    // Tap.maxDuration ensures a long hold can't fire navigation on release
    // if the pan gesture fails to activate for any reason.
    const tap = Gesture.Tap()
      .runOnJS(true)
      .enabled(enabled)
      .maxDuration(LONG_PRESS_MS - 50)
      .onEnd(() => {
        handlePress();
      });
    tapRef.current = tap;
    if (outerDrag) {
      tap.blocksExternalGesture(outerDrag.pan, outerDrag.tap);
    }

    return Gesture.Exclusive(pan, tap);
    // Shared values + refs keep handlers current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, Boolean(onPress), outerDrag]);

  const animatedStyle = useAnimatedStyle(() => {
    const active = lifted.value > 0;
    return {
      transform: [
        { translateY: translateY.value },
        { scale: 1 + lifted.value * 0.03 },
      ],
      zIndex: active ? 1000 : 0,
      elevation: active ? 24 : 0,
      shadowOpacity: active ? 0.2 : 0.06,
    };
  });

  return (
    <OuterDragContext.Provider value={dragRelations.current}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[styles.base, style, animatedStyle]}
          accessibilityHint="Long press and drag to reorder"
          accessibilityRole={onPress ? 'button' : undefined}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </OuterDragContext.Provider>
  );
}

/** Tap target that wins over the row tap, so a nested link can open on its own. */
export function BlockRowPress({
  onPress,
  children,
}: {
  onPress: () => void;
  children: ReactNode;
}) {
  const outer = useContext(OuterDragContext);
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd(() => {
        onPressRef.current();
      });
    if (outer) {
      tap.blocksExternalGesture(outer.pan, outer.tap);
    }
    return tap;
    // Parent gesture refs stay current; onPress is read from a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outer]);

  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false} style={styles.linkHit} accessibilityRole="button">
        {children}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'relative',
    shadowColor: '#000',
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  linkHit: {
    alignSelf: 'flex-start',
  },
});
