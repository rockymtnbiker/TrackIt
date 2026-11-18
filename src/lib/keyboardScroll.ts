import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
  type ScrollViewInstance,
  type ViewInstance,
} from 'react-native';

/** Room under a bare field for the Next button that follows it. */
const BUTTON_ROOM = 72;
const GAP = 12;
const OVERLAP_SLOP = 12;

type Host = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
  measureLayout: (
    relative: Host,
    success: (left: number, top: number, width: number, height: number) => void,
    failure: () => void,
  ) => void;
};

type Box = { top: number; height: number };

type AnchorMode = 'tail' | 'focus';

type Anchor = {
  node: ViewInstance;
  mode: AnchorMode;
};

export type KeyboardScope = {
  register: (id: number, node: ViewInstance | null, mode: AnchorMode) => void;
  poke: () => void;
};

const KeyboardAnchorContext = createContext<KeyboardScope | null>(null);

let anchorSeq = 0;

function asHost(value: unknown): Host | null {
  if (
    value != null &&
    typeof value === 'object' &&
    typeof (value as Host).measureInWindow === 'function'
  ) {
    return value as Host;
  }
  return null;
}

function focusedInput(): Host | null {
  const state = (
    TextInput as unknown as {
      State?: { currentlyFocusedInput: () => unknown };
    }
  ).State;
  return asHost(state?.currentlyFocusedInput());
}

/**
 * Top of the keyboard in window coordinates, same space as measureInWindow.
 * `screenY` is that position. A zero `screenY` falls back to the reported height.
 */
function keyboardWindowTop(event: { endCoordinates: { screenY: number; height: number } }) {
  if (event.endCoordinates.screenY > 0) {
    return event.endCoordinates.screenY;
  }
  return Dimensions.get('window').height - event.endCoordinates.height;
}

function measureBox(node: Host, relative: Host): Promise<Box | null> {
  if (typeof node.measureLayout !== 'function') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    node.measureLayout(
      relative,
      (_left, top, _width, height) => resolve({ top, height }),
      () => resolve(null),
    );
  });
}

/**
 * Keeps a Maya text answer and the button under it above the keyboard.
 *
 * The answer lives at the bottom of a scrolling thread. KeyboardAvoidingView
 * shrinks that thread and leaves the old offset in place, so the field stays
 * in the covered region. Android also reports the keyboard in screen
 * coordinates; subtracting the keyboard height from the window height misses
 * that line, and the leftover-overlap padding never appears.
 *
 * A `tail` anchor is the field plus its Send/Next button. Its bottom stays
 * just above the keyboard, including while the field grows by lines.
 * A `focus` anchor is a taller card: the whole card stays up when it fits,
 * otherwise the focused field does.
 *
 * `contentOrigin` is the scroll-content padding above `contentRef`.
 */
export function useKeyboardChatScroll(
  scrollRef: RefObject<ScrollViewInstance | null>,
  contentRef: RefObject<ViewInstance | null>,
  followEnd: () => boolean,
  contentOrigin = 0,
) {
  const followRef = useRef(followEnd);
  followRef.current = followEnd;
  const originRef = useRef(contentOrigin);
  originRef.current = contentOrigin;
  const keyboardTop = useRef<number | null>(null);
  const keyboardOpen = useRef(false);
  const insetReady = useRef(false);
  const frame = useRef<number | null>(null);
  const insetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extraFrame = useRef<number | null>(null);
  const extraTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const anchors = useRef(new Map<number, Anchor>());
  const [inset, setInset] = useState(0);
  const revealRef = useRef<() => void>(() => {});
  const scheduleRef = useRef<() => void>(() => {});
  const insetRef = useRef<() => void>(() => {});
  const burstRef = useRef<() => void>(() => {});

  const clearExtra = () => {
    if (extraFrame.current != null) {
      cancelAnimationFrame(extraFrame.current);
      extraFrame.current = null;
    }
    for (const id of extraTimers.current) {
      clearTimeout(id);
    }
    extraTimers.current = [];
  };

  scheduleRef.current = () => {
    if (frame.current != null) {
      return;
    }
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      revealRef.current();
    });
  };

  burstRef.current = () => {
    clearExtra();
    scheduleRef.current();
    extraFrame.current = requestAnimationFrame(() => {
      extraFrame.current = null;
      scheduleRef.current();
    });
    extraTimers.current.push(setTimeout(() => scheduleRef.current(), 80));
    extraTimers.current.push(setTimeout(() => scheduleRef.current(), 320));
  };

  const scope = useRef<KeyboardScope>({
    register: (id, node, mode) => {
      if (node) {
        anchors.current.set(id, { node, mode });
      } else {
        anchors.current.delete(id);
      }
    },
    poke: () => {
      if (keyboardOpen.current) {
        burstRef.current();
      }
    },
  }).current;

  revealRef.current = () => {
    const scroll = scrollRef.current;
    const content = asHost(contentRef.current);
    if (!scroll || !content) {
      return;
    }
    if (!keyboardOpen.current) {
      if (followRef.current()) {
        scroll.scrollToEnd({ animated: false });
      }
      return;
    }
    const scroller = asHost(scroll);
    if (!scroller) {
      return;
    }
    const anchor = [...anchors.current.values()].at(-1) ?? null;
    const input = focusedInput();
    scroller.measureInWindow((_x, scrollTop, _scrollWidth, scrollHeight) => {
      if (!keyboardOpen.current || !scrollRef.current) {
        return;
      }
      const line = keyboardTop.current ?? scrollTop + scrollHeight;
      const visible = Math.max(0, Math.min(scrollHeight, line - scrollTop));
      const scrollToBottom = (bottom: number) => {
        const target = Math.max(0, originRef.current + bottom + GAP - visible);
        scrollRef.current?.scrollTo({ y: target, animated: false });
      };
      const pinInput = () => {
        if (!input || typeof input.measureLayout !== 'function') {
          if (followRef.current()) {
            scrollRef.current?.scrollToEnd({ animated: false });
          }
          return;
        }
        input.measureLayout(
          content,
          (_left, top, _width, height) => {
            if (!keyboardOpen.current) {
              return;
            }
            const room = anchor ? GAP : BUTTON_ROOM;
            const target = Math.max(0, originRef.current + top + height + room - visible);
            scrollRef.current?.scrollTo({ y: target, animated: false });
          },
          () => {
            if (followRef.current()) {
              scrollRef.current?.scrollToEnd({ animated: false });
            }
          },
        );
      };
      if (!anchor) {
        pinInput();
        return;
      }
      void measureBox(asHost(anchor.node) ?? (anchor.node as unknown as Host), content).then((box) => {
        if (!keyboardOpen.current || !box) {
          pinInput();
          return;
        }
        if (anchor.mode === 'tail' || box.height + GAP <= visible) {
          scrollToBottom(box.top + box.height);
          return;
        }
        pinInput();
      });
    });
  };

  insetRef.current = () => {
    if (!insetReady.current) {
      return;
    }
    if (insetTimer.current) {
      clearTimeout(insetTimer.current);
    }
    insetTimer.current = setTimeout(() => {
      insetTimer.current = null;
      const scroll = asHost(scrollRef.current);
      const top = keyboardTop.current;
      if (!scroll || top == null || !keyboardOpen.current) {
        return;
      }
      scroll.measureInWindow((_x, y, _width, height) => {
        if (!keyboardOpen.current || keyboardTop.current == null) {
          return;
        }
        const overlap = Math.max(0, Math.round(y + height - keyboardTop.current));
        const next = overlap > OVERLAP_SLOP ? overlap : 0;
        setInset((current) => (current === next ? current : next));
      });
    }, 80);
  };

  useEffect(() => {
    if (keyboardOpen.current) {
      scheduleRef.current();
    }
  }, [inset]);

  useEffect(() => {
    const markOpen = (event: { endCoordinates: { screenY: number; height: number } }) => {
      keyboardOpen.current = true;
      keyboardTop.current = keyboardWindowTop(event);
    };
    const willShow =
      Platform.OS === 'ios'
        ? Keyboard.addListener('keyboardWillShow', (event) => {
            markOpen(event);
            burstRef.current();
          })
        : null;
    const didShow = Keyboard.addListener('keyboardDidShow', (event) => {
      markOpen(event);
      insetReady.current = true;
      burstRef.current();
      insetRef.current();
    });
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        keyboardOpen.current = false;
        keyboardTop.current = null;
        insetReady.current = false;
        clearExtra();
        if (frame.current != null) {
          cancelAnimationFrame(frame.current);
          frame.current = null;
        }
        setInset(0);
        if (followRef.current()) {
          scrollRef.current?.scrollToEnd({ animated: false });
        }
      },
    );
    return () => {
      willShow?.remove();
      didShow.remove();
      hide.remove();
      clearExtra();
      if (frame.current != null) {
        cancelAnimationFrame(frame.current);
      }
      if (insetTimer.current) {
        clearTimeout(insetTimer.current);
      }
    };
  }, [scrollRef]);

  return {
    inset,
    scope,
    onLayout: () => {
      if (!keyboardOpen.current) {
        return;
      }
      burstRef.current();
      insetRef.current();
    },
    onContentSizeChange: () => {
      if (keyboardOpen.current) {
        burstRef.current();
        return;
      }
      if (followRef.current()) {
        scheduleRef.current();
      }
    },
  };
}

export function KeyboardChatScope({
  scope,
  children,
}: {
  scope: KeyboardScope;
  children: ReactNode;
}) {
  return createElement(KeyboardAnchorContext.Provider, { value: scope }, children);
}

/** Field and the button under it. `tail` pins that pair. `focus` pins a taller card, or the field when the card cannot fit. */
export function KeyboardAnswer({
  mode = 'tail',
  style,
  children,
}: {
  mode?: AnchorMode;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const scope = useContext(KeyboardAnchorContext);
  const id = useRef(0);
  if (id.current === 0) {
    id.current = ++anchorSeq;
  }
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const bind = useCallback(
    (node: ViewInstance | null) => {
      scope?.register(id.current, node, modeRef.current);
    },
    [scope],
  );
  useEffect(() => {
    return () => scope?.register(id.current, null, modeRef.current);
  }, [scope]);
  return createElement(
    View,
    { ref: bind, style, collapsable: false, onLayout: () => scope?.poke() },
    children,
  );
}

export function useKeyboardPoke(): () => void {
  const scope = useContext(KeyboardAnchorContext);
  return scope?.poke ?? (() => {});
}
