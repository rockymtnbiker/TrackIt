import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GoalSetupChoices } from '../../components/GoalSetupChoiceSheet';
import { ONBOARDING } from '../../constants/onboarding';
import { useAuth } from '../../context/AuthContext';
import {
  getGoalSetupChoice,
  saveGoalSetupChoice,
  type GoalSetupChoice,
} from '../../lib/goalSetupChoice';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStackNavigator';
import { OnboardingFrame } from './OnboardingFrame';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'FirstGoal'>;

const copy = ONBOARDING.firstGoal;

export default function FirstGoalScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [setupChoice, setSetupChoice] = useState<GoalSetupChoice | null>(null);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) {
      return;
    }
    let cancelled = false;
    void getGoalSetupChoice(userId).then((choice) => {
      if (!cancelled) {
        setSetupChoice(choice);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const pickSetup = (choice: GoalSetupChoice) => {
    const userId = user?.id;
    if (userId) {
      void saveGoalSetupChoice(userId, choice);
    }
    setSetupChoice(choice);
    if (choice === 'maya') {
      navigation.navigate('Maya');
      return;
    }
    navigation.navigate('GoalSetup');
  };

  return (
    <OnboardingFrame
      step={3}
      footer={
        <GoalSetupChoices
          selected={setupChoice}
          onMaya={() => pickSetup('maya')}
          onOwn={() => pickSetup('own')}
        />
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
