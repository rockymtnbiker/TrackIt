import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BlockedScreen from '../screens/BlockedScreen';
import CommunityScreen from '../screens/CommunityScreen';
import GoalScreen from '../screens/GoalScreen';
import PartnerScreen from '../screens/PartnerScreen';
import type { GoalRouteParams } from './GoalsStackNavigator';

export type CommunityStackParamList = {
  CommunityMain: undefined;
  Partner: { connectionId: string; name: string; partnerId: string | null };
  Blocked: undefined;
  Goal: GoalRouteParams;
};

const Stack = createNativeStackNavigator<CommunityStackParamList>();

export default function CommunityStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="CommunityMain"
        component={CommunityScreen}
        options={{
          title: 'Community',
          headerBackTitle: 'Community',
          headerTitleAlign: 'center',
        }}
      />
      <Stack.Screen
        name="Partner"
        component={PartnerScreen}
        options={({ route }) => ({
          title: route.params.name,
          headerTitleAlign: 'center',
        })}
      />
      <Stack.Screen
        name="Blocked"
        component={BlockedScreen}
        options={{ title: 'Blocked', headerTitleAlign: 'center' }}
      />
      <Stack.Screen
        name="Goal"
        component={GoalScreen}
        options={{ title: '', headerTitleAlign: 'center' }}
      />
    </Stack.Navigator>
  );
}
