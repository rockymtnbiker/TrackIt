import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CommentThreadScreen from '../screens/CommentThreadScreen';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';
import GoalScreen from '../screens/GoalScreen';
import GoalSetupScreen from '../screens/GoalSetupScreen';
import GoalsListScreen from '../screens/GoalsListScreen';
import ProfileScreen from '../screens/ProfileScreen';

export type GoalRouteParams = {
  goalId: string;
  readOnly?: boolean;
  ownerId?: string;
  sharedByName?: string;
};

export type CommentThreadParams = {
  goalId: string;
  ownerId: string;
  partnerId: string;
  goalTitle: string;
  partnerName: string;
};

export type GoalsStackParamList = {
  GoalsList: undefined;
  GoalSetup: undefined;
  Goal: GoalRouteParams;
  Profile: undefined;
  DeleteAccount: undefined;
  StepDetail: { goalId: string };
  Comments: CommentThreadParams;
};

export type TodayStackParamList = {
  TodayMain: { focusToday?: number; freshGoalId?: string } | undefined;
  Goal: GoalRouteParams;
  StepDetail: { goalId: string };
  Comments: CommentThreadParams;
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
        name="Goal"
        component={GoalScreen}
        options={{ title: '', headerTitleAlign: 'center' }}
      />
      <Stack.Screen
        name="Comments"
        component={CommentThreadScreen}
        options={{ title: 'Comments', headerTitleAlign: 'center' }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          headerTitleAlign: 'center',
          headerBackTitle: 'Plan',
        }}
      />
      <Stack.Screen
        name="DeleteAccount"
        component={DeleteAccountScreen}
        options={{ title: 'Delete account', headerTitleAlign: 'center' }}
      />
    </Stack.Navigator>
  );
}
