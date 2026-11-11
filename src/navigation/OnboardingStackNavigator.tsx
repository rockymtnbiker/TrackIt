import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import GoalSetupScreen from '../screens/GoalSetupScreen';
import MayaFlowScreen from '../screens/MayaFlowScreen';
import type { CommunityStackParamList } from './CommunityStackNavigator';
import FirstGoalScreen from '../screens/onboarding/FirstGoalScreen';
import HowItWorksScreen from '../screens/onboarding/HowItWorksScreen';
import NameScreen from '../screens/onboarding/NameScreen';
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import type { GoalsStackParamList } from './GoalsStackNavigator';

export type OnboardingStackParamList = {
  Welcome: undefined;
  HowItWorks: undefined;
  Name: undefined;
  FirstGoal: undefined;
  GoalSetup: undefined;
  Maya: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

function OnboardingMaya(
  props: NativeStackScreenProps<OnboardingStackParamList, 'Maya'>,
) {
  return (
    <MayaFlowScreen
      {...(props as NativeStackScreenProps<CommunityStackParamList, 'Maya'>)}
    />
  );
}

function OnboardingGoalSetup(
  props: NativeStackScreenProps<OnboardingStackParamList, 'GoalSetup'>,
) {
  return (
    <GoalSetupScreen
      {...(props as NativeStackScreenProps<GoalsStackParamList, 'GoalSetup'>)}
    />
  );
}

export default function OnboardingStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerTitleAlign: 'center' }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="HowItWorks"
        component={HowItWorksScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Name" component={NameScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="FirstGoal"
        component={FirstGoalScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="GoalSetup"
        component={OnboardingGoalSetup}
        options={{ title: 'Step 1 of 3', headerBackTitle: 'Back' }}
      />
      <Stack.Screen
        name="Maya"
        component={OnboardingMaya}
        options={{
          presentation: 'fullScreenModal',
          title: 'Maya',
          headerTitleAlign: 'center',
          headerBackVisible: false,
        }}
      />
    </Stack.Navigator>
  );
}
