import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Animated, StyleSheet, View, type ScrollViewInstance, type ViewInstance } from 'react-native';
import { useReflectTheme } from '../constants/reflectTheme';

/** How long a pointed control stays outlined. */
const HIGHLIGHT_MS = 2000;

export const REFLECT_POINT = {
  pencil: 'pencil',
  status: 'status',
  addStep: 'addStep',
  target: 'target',
  targetEnd: 'targetEnd',
  step: (id: string) => `step:${id}`,
} as const;

type AnchorProps = {
  id: string;
  active: boolean;
  accent: string;
  onRegister: (id: string, node: ViewInstance | null) => void;
  children: ReactNode;
};

function ReflectPointAnchor({ id, active, accent, onRegister, children }: AnchorProps) {
  const ref = useRef<ViewInstance>(null);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    onRegister(id, ref.current);
    return () => onRegister(id, null);
  }, [id, onRegister]);

  useEffect(() => {
    if (!active) {
      return;
    }
    opacity.setValue(1);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 400, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, opacity]);

  return (
    <View ref={ref} collapsable={false} style={styles.anchor}>
      {children}
      {active ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.pulse, { borderColor: accent, opacity }]}
        />
      ) : null}
    </View>
  );
}

/**
 * Scroll a Goal page control into view and outline it in the reflect accent.
 * Every "point to" in the reflection uses this.
 */
export function useReflectPoint(scrollRef: RefObject<ScrollViewInstance | null>) {
  const theme = useReflectTheme();
  const anchors = useRef(new Map<string, ViewInstance>());
  const [activeId, setActiveId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const register = useCallback((id: string, node: ViewInstance | null) => {
    if (node) {
      anchors.current.set(id, node);
    } else {
      anchors.current.delete(id);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  const pointTo = useCallback(
    (id: string) => {
      const host = anchors.current.get(id);
      const scroller = scrollRef.current;
      const content = scroller?.getInnerViewRef() ?? null;
      if (host && scroller && content) {
        host.measureLayout(
          content,
          (_left, top) => {
            scroller.scrollTo({ y: Math.max(0, top - 12), animated: true });
          },
          () => {},
        );
      }
      setActiveId(id);
      if (timer.current) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(() => {
        setActiveId((current) => (current === id ? null : current));
      }, HIGHLIGHT_MS);
    },
    [scrollRef],
  );

  const anchor = useCallback(
    (id: string, child: ReactNode) => (
      <ReflectPointAnchor
        id={id}
        active={activeId === id}
        accent={theme.accent}
        onRegister={register}
      >
        {child}
      </ReflectPointAnchor>
    ),
    [activeId, register, theme.accent],
  );

  return { pointTo, anchor };
}

const styles = StyleSheet.create({
  anchor: {
    position: 'relative',
  },
  pulse: {
    borderWidth: 2,
    borderRadius: 12,
  },
});
