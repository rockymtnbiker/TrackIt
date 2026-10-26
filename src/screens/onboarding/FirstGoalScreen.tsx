import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { ONBOARDING } from '../../constants/onboarding';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStackNavigator';
import { OnboardingButton, OnboardingFrame } from './OnboardingFrame';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'FirstGoal'>;

const copy = ONBOARDING.firstGoal;

export default function FirstGoalScreen({ navigation }: Props) {
  return (
    <OnboardingFrame
      step={3}
      footer={
        <OnboardingButton label={copy.start} onPress={() => navigation.navigate('GoalSetup')} />
      }
    >
      <View style={styles.body}>
        <Text style={styles.title}>{copy.title}</Text>
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  body: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
  },
});
