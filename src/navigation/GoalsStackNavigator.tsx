import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ChatScreen from '../screens/ChatScreen';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';
import MayaFlowScreen from '../screens/MayaFlowScreen';
import GoalScreen from '../screens/GoalScreen';
import GoalSetupScreen from '../screens/GoalSetupScreen';
import GoalsListScreen from '../screens/GoalsListScreen';
import LearnArticleScreen from '../screens/LearnArticleScreen';
import LearnScreen from '../screens/LearnScreen';
import { HowItWorksReplayScreen } from '../screens/onboarding/HowItWorksScreen';
import type { LearnTab } from '../constants/learn';
import ProfileScreen from '../screens/ProfileScreen';

export type GoalRouteParams = {
  goalId: string;
  readOnly?: boolean;
  ownerId?: string;
  sharedByName?: string;
  /** Open the goal already editing, scrolled to the Reminder row. */
  editReminder?: boolean;
  /** Open the goal already in edit mode. */
  startEditing?: boolean;
  /** Show a bar that returns to the weekly reflection in progress. */
  fromReflection?: boolean;
};

export type ChatParams = {
  connectionId: string;
  otherId: string | null;
  otherName: string;
  role: 'partner' | 'coach';
  /** Top-level goal to tag on messages until the chip is removed. */
  goalId?: string;
  /** Opened from the weekly reflection's "Send a note". */
  fromReflection?: boolean;
};

export type GoalsStackParamList = {
  GoalsList: undefined;
  GoalSetup: undefined;
  Maya: undefined;
  Goal: GoalRouteParams;
  Chat: ChatParams;
  Profile: undefined;
  DeleteAccount: undefined;
  HowItWorks: undefined;
  Learn: { tab?: LearnTab } | undefined;
  LearnArticle: { id: string };
};

export type TodayStackParamList = {
  TodayMain: { focusToday?: number; freshGoalId?: string } | undefined;
  GoalSetup: undefined;
  Maya: undefined;
  Goal: GoalRouteParams;
  Chat: ChatParams;
  Learn: { tab?: LearnTab } | undefined;
  LearnArticle: { id: string };
  HowItWorks: undefined;
};

const Stack = createNativeStackNavigator<GoalsStackParamList>();

export default function GoalsStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="GoalsList"
        component={GoalsListScreen}
        options={{ headerShown: false, title: 'Plan', headerBackTitle: 'Plan' }}
      />
      <Stack.Screen
        name="GoalSetup"
        component={GoalSetupScreen}
        options={{ title: 'Step 1 of 3', headerTitleAlign: 'center' }}
      />
      <Stack.Screen
        name="Maya"
        component={MayaFlowScreen}
        options={{
          presentation: 'fullScreenModal',
          title: 'Maya',
          headerTitleAlign: 'center',
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="Goal"
        component={GoalScreen}
        options={{ title: '', headerTitleAlign: 'center' }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ headerTitleAlign: 'center' }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Settings',
          headerTitleAlign: 'center',
          headerBackTitle: 'Plan',
        }}
      />
      <Stack.Screen
        name="DeleteAccount"
        component={DeleteAccountScreen}
        options={{ title: 'Delete account', headerTitleAlign: 'center' }}
      />
      <Stack.Screen
        name="HowItWorks"
        component={HowItWorksReplayScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Learn"
        component={LearnScreen}
        options={{ title: 'Learn', headerTitleAlign: 'center' }}
      />
      <Stack.Screen
        name="LearnArticle"
        component={LearnArticleScreen}
        options={{ title: 'Learn', headerBackTitle: 'Learn', headerTitleAlign: 'center' }}
      />
    </Stack.Navigator>
  );
}
