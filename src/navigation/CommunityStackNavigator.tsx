import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BlockedScreen from '../screens/BlockedScreen';
import CommentThreadScreen from '../screens/CommentThreadScreen';
import CommunityScreen from '../screens/CommunityScreen';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';
import GoalScreen from '../screens/GoalScreen';
import LearnScreen from '../screens/LearnScreen';
import PartnerScreen from '../screens/PartnerScreen';
import ProfileScreen from '../screens/ProfileScreen';
import type { CommentThreadParams, GoalRouteParams } from './GoalsStackNavigator';

export type CommunityStackParamList = {
  CommunityMain: undefined;
  Learn: undefined;
  Partner: { connectionId: string; name: string; partnerId: string | null };
  Blocked: undefined;
  Goal: GoalRouteParams;
  Comments: CommentThreadParams;
  Profile: undefined;
  DeleteAccount: undefined;
};

const Stack = createNativeStackNavigator<CommunityStackParamList>();

export default function CommunityStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="CommunityMain"
        component={CommunityScreen}
        options={{
          headerShown: false,
          title: 'Connect',
          headerBackTitle: 'Connect',
        }}
      />
      <Stack.Screen
        name="Learn"
        component={LearnScreen}
        options={{
          title: 'Learn',
          headerBackTitle: 'Connect',
          headerTitleAlign: 'center',
        }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          headerTitleAlign: 'center',
          headerBackTitle: 'Connect',
        }}
      />
      <Stack.Screen
        name="DeleteAccount"
        component={DeleteAccountScreen}
        options={{ title: 'Delete account', headerTitleAlign: 'center' }}
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
      <Stack.Screen
        name="Comments"
        component={CommentThreadScreen}
        options={{ title: 'Comments', headerTitleAlign: 'center' }}
      />
    </Stack.Navigator>
  );
}
