import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ONBOARDING } from '../../constants/onboarding';
import { LEARN_VIDEOS } from '../../constants/learn';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStackNavigator';
import { OnboardingButton, OnboardingFrame, OnboardingSkip } from './OnboardingFrame';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Welcome'>;

const copy = ONBOARDING.welcome;

export default function WelcomeScreen({ navigation }: Props) {
  const welcome = LEARN_VIDEOS.find((video) => video.id === 'welcome');
  const title = welcome?.title ?? 'Welcome';
  const url = welcome?.url ?? null;

  const card = (
    <>
      <Text style={styles.cardTitle}>{title}</Text>
      {url ? null : <Text style={styles.comingSoon}>{copy.comingSoon}</Text>}
    </>
  );

  return (
    <OnboardingFrame
      step={0}
      footer={
        <>
          <OnboardingButton label={copy.next} onPress={() => navigation.navigate('HowItWorks')} />
          <OnboardingSkip label={copy.skip} onPress={() => navigation.navigate('Name')} />
        </>
      }
    >
      <View style={styles.body}>
        {url ? (
          <Pressable
            onPress={() => {
              void Linking.openURL(url);
            }}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={title}
          >
            {card}
          </Pressable>
        ) : (
          <View style={styles.card} accessibilityLabel={`${title}, ${copy.comingSoon}`}>
            {card}
          </View>
        )}
        <Text style={styles.headline}>{copy.headline}</Text>
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  body: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 28,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  comingSoon: {
    fontSize: 13,
    color: '#8e8e93',
  },
  headline: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.55,
  },
});
