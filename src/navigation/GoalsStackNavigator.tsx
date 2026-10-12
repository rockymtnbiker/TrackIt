import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';
import GoalScreen from '../screens/GoalScreen';
import GoalsListScreen from '../screens/GoalsListScreen';
import SettingsScreen from '../screens/SettingsScreen';

export type GoalsStackParamList = {
  GoalsList: undefined;
  Goal: { goalId: string };
  Settings: undefined;
  DeleteAccount: undefined;
  StepDetail: { goalId: string };
};

export type TodayStackParamList = {
  TodayMain: undefined;
  Goal: { goalId: string };
  StepDetail: { goalId: string };
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
        name="Goal"
        component={GoalScreen}
        options={{ title: '', headerTitleAlign: 'center' }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings', headerTitleAlign: 'center' }}
      />
      <Stack.Screen
        name="DeleteAccount"
        component={DeleteAccountScreen}
        options={{ title: 'Delete account', headerTitleAlign: 'center' }}
      />
    </Stack.Navigator>
  );
}
