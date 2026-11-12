import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { LoopDiagram } from '../../components/LoopDiagram';
import { ONBOARDING } from '../../constants/onboarding';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStackNavigator';
import { OnboardingButton, OnboardingFrame } from './OnboardingFrame';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'HowItWorks'>;

const copy = ONBOARDING.howItWorks;
const cards = copy.cards;

const DIAGRAM_HEIGHT = 235;
const DIAGRAM_GAP = 12;
const TITLE_BLOCK = 28 + 8;
/** Eight lines at 22px. Tall enough for the longest card on a 320pt-wide phone. */
const BODY_MIN_HEIGHT = 22 * 8;

function clampPage(index: number): number {
  return Math.max(0, Math.min(cards.length - 1, index));
}

function HowItWorksView({
  onFinish,
  showProgress = true,
}: {
  onFinish: () => void;
  showProgress?: boolean;
}) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const pageRef = useRef(0);
  const swiping = useRef(false);
  const [pageWidth, setPageWidth] = useState(0);
  const [page, setPage] = useState(0);
  pageRef.current = page;

  useEffect(() => {
    if (pageWidth <= 0) {
      return;
    }
    scrollRef.current?.scrollTo({ x: pageRef.current * pageWidth, animated: false });
  }, [pageWidth]);

  const goTo = (index: number) => {
    const next = clampPage(index);
    swiping.current = false;
    setPage(next);
    if (pageWidth > 0) {
      scrollRef.current?.scrollTo({ x: next * pageWidth, animated: true });
    }
  };

  const last = page === cards.length - 1;
  const highlight = cards[page].highlight;

  return (
    <OnboardingFrame
      step={1}
      showProgress={showProgress}
      headerRight={
        last ? null : (
          <Pressable
            onPress={onFinish}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={copy.skip}
          >
            <Text style={styles.skipText}>{copy.skip}</Text>
          </Pressable>
        )
      }
      footer={
        <>
          <OnboardingButton
            label={last ? copy.letsGo : copy.next}
            onPress={() => {
              if (last) {
                onFinish();
                return;
              }
              goTo(page + 1);
            }}
          />
          <Pressable
            onPress={() => goTo(page - 1)}
            disabled={page === 0}
            accessibilityRole="button"
            accessibilityLabel={copy.back}
            accessibilityElementsHidden={page === 0}
            importantForAccessibility={page === 0 ? 'no-hide-descendants' : 'auto'}
            style={styles.back}
          >
            <Text style={[styles.backText, page === 0 && styles.hidden]}>{copy.back}</Text>
          </Pressable>
        </>
      }
    >
      <View style={styles.body}>
        <View
          style={styles.pager}
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            if (width > 0 && width !== pageWidth) {
              setPageWidth(width);
            }
          }}
        >
          {pageWidth > 0 ? (
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              directionalLockEnabled
              nestedScrollEnabled
              disableIntervalMomentum
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              onScrollBeginDrag={() => {
                swiping.current = true;
              }}
              onMomentumScrollEnd={(event) => {
                if (!swiping.current) {
                  return;
                }
                swiping.current = false;
                const next = clampPage(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
                setPage((current) => (current === next ? current : next));
              }}
            >
              {cards.map((card, index) => (
                <View
                  key={card.key}
                  style={[styles.page, { width: pageWidth }]}
                  accessibilityElementsHidden={index !== page}
                  importantForAccessibility={index === page ? 'auto' : 'no-hide-descendants'}
                >
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <View style={styles.bodySlot}>
                    <Text style={styles.cardBody}>{card.body}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.page}>
              <Text style={styles.cardTitle}>{cards[0].title}</Text>
              <View style={styles.bodySlot}>
                <Text style={styles.cardBody}>{cards[0].body}</Text>
              </View>
            </View>
          )}
          <View pointerEvents="none" style={styles.diagramOverlay}>
            <LoopDiagram highlight={highlight} />
          </View>
        </View>
        <View
          style={styles.pageDots}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${page + 1} of ${cards.length}`}
        >
          {cards.map((card, index) => (
            <View
              key={card.key}
              style={[styles.pageDot, index === page && styles.pageDotActive]}
            />
          ))}
        </View>
      </View>
    </OnboardingFrame>
  );
}

export default function HowItWorksScreen({ navigation }: Props) {
  return <HowItWorksView onFinish={() => navigation.navigate('Name')} />;
}

/** Opened from Profile. Closes in place and does not continue onboarding. */
export function HowItWorksReplayScreen({
  navigation,
}: {
  navigation: { goBack: () => void };
}) {
  return <HowItWorksView showProgress={false} onFinish={() => navigation.goBack()} />;
}

const styles = StyleSheet.create({
  body: {
    flexGrow: 1,
  },
  pager: {
    minHeight: DIAGRAM_HEIGHT + DIAGRAM_GAP + TITLE_BLOCK + BODY_MIN_HEIGHT,
  },
  page: {
    paddingTop: DIAGRAM_HEIGHT + DIAGRAM_GAP,
  },
  diagramOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
    marginBottom: 8,
  },
  bodySlot: {
    minHeight: BODY_MIN_HEIGHT,
  },
  cardBody: {
    fontSize: 16,
    lineHeight: 22,
    color: '#6B6B70',
    textAlign: 'center',
    includeFontPadding: false,
  },
  pageDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  pageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#d1d1d6',
  },
  pageDotActive: {
    backgroundColor: '#111',
  },
  back: {
    minHeight: 40,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#007aff',
  },
  hidden: {
    opacity: 0,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#007aff',
  },
});
