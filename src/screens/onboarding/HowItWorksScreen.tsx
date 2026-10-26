import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ONBOARDING } from '../../constants/onboarding';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStackNavigator';
import { OnboardingButton, OnboardingFrame, OnboardingSkip } from './OnboardingFrame';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'HowItWorks'>;

const copy = ONBOARDING.howItWorks;

export default function HowItWorksScreen({ navigation }: Props) {
  const [pageWidth, setPageWidth] = useState(0);
  const [page, setPage] = useState(0);

  return (
    <OnboardingFrame
      step={1}
      footer={
        <>
          <OnboardingButton label={copy.next} onPress={() => navigation.navigate('Name')} />
          <OnboardingSkip label={copy.skip} onPress={() => navigation.navigate('Name')} />
        </>
      }
    >
      <View style={styles.body}>
        <View
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            if (width !== pageWidth) {
              setPageWidth(width);
            }
          }}
        >
          {pageWidth > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              onMomentumScrollEnd={(event) => {
                const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
                setPage(Math.max(0, Math.min(copy.cards.length - 1, next)));
              }}
            >
              {copy.cards.map((card) => (
                <View key={card.key} style={[styles.page, { width: pageWidth }]}>
                  <View
                    style={styles.card}
                    accessibilityLabel={`${card.title}. ${card.body}`}
                  >
                    <Text style={styles.cardTitle}>{card.title}</Text>
                    <Text style={styles.cardBody}>{card.body}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.cardPlaceholder} />
          )}
        </View>
        <View style={styles.pageDots} accessibilityLabel={`${page + 1} of ${copy.cards.length}`}>
          {copy.cards.map((card, index) => (
            <View
              key={card.key}
              style={[styles.pageDot, index === page && styles.pageDotActive]}
            />
          ))}
        </View>
        <Text style={styles.help}>{copy.help}</Text>
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  body: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  page: {
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    minHeight: 180,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  cardPlaceholder: {
    minHeight: 180,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
  },
  cardBody: {
    fontSize: 17,
    lineHeight: 24,
    color: '#6B6B70',
    textAlign: 'center',
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
    backgroundColor: '#007aff',
  },
  help: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 18,
    color: '#6B6B70',
    textAlign: 'center',
  },
});
