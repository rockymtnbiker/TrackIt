import { createContext, useContext, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type ViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const NEAR_BOTTOM = 40;

type Host = {
  measureLayout: (
    relative: Host,
    success: (left: number, top: number, width: number, height: number) => void,
    failure: () => void,
  ) => void;
};

type BubbleApi = {
  onMayaBubble: (node: ViewInstance) => void;
};

const MayaTurnContext = createContext<BubbleApi | null>(null);

function asHost(value: unknown): Host | null {
  if (
    value != null &&
    typeof value === 'object' &&
    typeof (value as Host).measureLayout === 'function'
  ) {
    return value as Host;
  }
  return null;
}

/**
 * After an answer, put Maya's first new bubble at the top of the thread.
 * If that whole turn fits, stay at the bottom. Later bubbles do not pull
 * the scroll once the turn is taller than the screen.
 *
 * Maya chats are not inverted. An inverted list flips the offset so the
 * bubble's bottom lands on the visual top.
 */
export function useMayaTurnScroll(
  scrollRef: RefObject<ScrollViewInstance | null>,
  contentRef: RefObject<ViewInstance | null>,
  turnKey: string,
  options?: { inverted?: boolean; origin?: number },
) {
  const inverted = options?.inverted ?? false;
  const origin = options?.origin ?? 0;
  const followEnd = useRef(true);
  const generation = useRef(0);
  const expectGen = useRef(0);
  const keyRef = useRef<string | null>(null);
  const anchorTop = useRef<number | null>(null);
  const anchorHeight = useRef(0);
  const holding = useRef(false);
  const stopped = useRef(false);
  const programmatic = useRef(false);
  const placedY = useRef<number | null>(null);
  const scrollY = useRef(0);
  const viewH = useRef(0);
  const contentH = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showJump, setShowJump] = useState(false);

  if (keyRef.current !== turnKey) {
    const first = keyRef.current == null;
    keyRef.current = turnKey;
    if (!first) {
      generation.current += 1;
      anchorTop.current = null;
      holding.current = false;
      stopped.current = false;
      followEnd.current = true;
    }
    expectGen.current = generation.current;
  }

  const updateJump = (y: number, view: number, content: number) => {
    const gap = content - (y + view);
    const next = gap > NEAR_BOTTOM;
    setShowJump((current) => (current === next ? current : next));
  };

  const scrollToY = (y: number, animated: boolean) => {
    programmatic.current = true;
    placedY.current = y;
    scrollRef.current?.scrollTo({ y: Math.max(0, y), animated });
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      programmatic.current = false;
    }, animated ? 450 : 80);
  };

  const place = () => {
    if (holding.current || stopped.current) {
      return;
    }
    const anchor = anchorTop.current;
    const view = viewH.current;
    const content = contentH.current;
    if (anchor == null || view <= 0 || content <= 0) {
      return;
    }
    const top = origin + anchor;
    const turnHeight = content - top;
    if (turnHeight <= view) {
      followEnd.current = true;
      scrollToY(content - view, false);
      return;
    }
    followEnd.current = false;
    stopped.current = true;
    const target = inverted ? top + anchorHeight.current - view : top;
    scrollToY(target, true);
  };

  const api = useRef<BubbleApi>({
    onMayaBubble: (node) => {
      if (expectGen.current !== generation.current) {
        return;
      }
      const content = asHost(contentRef.current);
      const bubble = asHost(node);
      if (!content || !bubble) {
        return;
      }
      expectGen.current = -1;
      bubble.measureLayout(
        content,
        (_left, top, _width, height) => {
          if (anchorTop.current != null) {
            return;
          }
          anchorTop.current = top;
          anchorHeight.current = height;
          place();
        },
        () => {
          expectGen.current = generation.current;
        },
      );
    },
  }).current;

  const noteUserOffset = (y: number) => {
    if (programmatic.current || placedY.current == null) {
      return;
    }
    if (y < placedY.current - NEAR_BOTTOM) {
      holding.current = true;
      stopped.current = true;
      followEnd.current = false;
    }
  };

  return {
    followEnd,
    showJump,
    bubbleApi: api,
    hold: () => {
      holding.current = true;
      stopped.current = true;
      followEnd.current = false;
    },
    place,
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      const view = event.nativeEvent.layoutMeasurement.height;
      const content = event.nativeEvent.contentSize.height;
      scrollY.current = y;
      viewH.current = view;
      contentH.current = content;
      updateJump(y, view, content);
    },
    onScrollBeginDrag: () => {
      programmatic.current = false;
    },
    onScrollEndDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      noteUserOffset(event.nativeEvent.contentOffset.y);
    },
    onMomentumScrollEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      noteUserOffset(event.nativeEvent.contentOffset.y);
    },
    onViewport: (height: number) => {
      viewH.current = height;
      place();
    },
    onContentSize: (height: number) => {
      contentH.current = height;
      updateJump(scrollY.current, viewH.current, height);
      if (anchorTop.current == null) {
        if (!holding.current && followEnd.current && viewH.current > 0) {
          scrollToY(height - viewH.current, false);
        }
        return;
      }
      place();
    },
    jump: () => {
      const y = Math.max(0, contentH.current - viewH.current);
      scrollToY(y, true);
      scrollRef.current?.scrollToEnd({ animated: true });
    },
  };
}

export function MayaTurnScope({ api, children }: { api: BubbleApi; children: ReactNode }) {
  return <MayaTurnContext.Provider value={api}>{children}</MayaTurnContext.Provider>;
}

/** First layout of a Maya bubble. Later bubbles in the same turn do not move the anchor. */
export function useMayaBubbleAnchor(): (node: ViewInstance | null) => void {
  const api = useContext(MayaTurnContext);
  const seen = useRef(false);
  return (node) => {
    if (!node || seen.current || !api) {
      return;
    }
    seen.current = true;
    api.onMayaBubble(node);
  };
}

export function MayaScrollJump({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  const insets = useSafeAreaInsets();
  if (!visible) {
    return null;
  }
  return (
    <Pressable
      onPress={onPress}
      style={[styles.jump, { bottom: Math.max(insets.bottom, 12) }]}
      accessibilityRole="button"
      accessibilityLabel="Scroll to latest"
    >
      <Text style={styles.jumpText}>↓</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  jump: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  jumpText: {
    fontSize: 18,
    lineHeight: 22,
    color: '#007aff',
    fontWeight: '600',
  },
});
