import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BlockedScreen from '../screens/BlockedScreen';
import ChatScreen from '../screens/ChatScreen';
import CommunityScreen from '../screens/CommunityScreen';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';
import LearnArticleScreen from '../screens/LearnArticleScreen';
import LearnScreen from '../screens/LearnScreen';
import GoalScreen from '../screens/GoalScreen';
import GroupsInterestScreen from '../screens/GroupsInterestScreen';
import PartnerScreen from '../screens/PartnerScreen';
import MayaFlowScreen from '../screens/MayaFlowScreen';
import MayaHomeScreen from '../screens/MayaHomeScreen';
import { HowItWorksReplayScreen } from '../screens/onboarding/HowItWorksScreen';
import ProfileScreen from '../screens/ProfileScreen';
import type { LearnTab } from '../constants/learn';
import type { ChatParams, GoalRouteParams } from './GoalsStackNavigator';

export type CommunityStackParamList = {
  CommunityMain:
    | {
        openSupport?: 'talk' | 'setup';
        openInvite?: boolean;
        openCodeInvite?: { goalId: string; goalTitle: string; title: string };
      }
    | undefined;
  Learn: { tab?: LearnTab } | undefined;
  LearnArticle: { id: string };
  MayaHome: undefined;
  Maya: undefined;
  Partner: { connectionId: string; name: string; partnerId: string | null };
  Chat: ChatParams;
  Blocked: undefined;
  Goal: GoalRouteParams;
  Profile: undefined;
  DeleteAccount: undefined;
  HowItWorks: undefined;
  GroupsInterest: undefined;
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
          headerTitleAlign: 'center',
        }}
      />
      <Stack.Screen
        name="LearnArticle"
        component={LearnArticleScreen}
        options={{
          title: 'Learn',
          headerBackTitle: 'Learn',
          headerTitleAlign: 'center',
        }}
      />
      <Stack.Screen
        name="GroupsInterest"
        component={GroupsInterestScreen}
        options={{
          title: 'Groups',
          headerTitleAlign: 'center',
          headerBackTitle: 'Connect',
        }}
      />
      <Stack.Screen
        name="MayaHome"
        component={MayaHomeScreen}
        options={{
          title: 'Maya',
          headerTitleAlign: 'center',
          headerBackTitle: 'Connect',
        }}
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
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Settings',
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
        name="HowItWorks"
        component={HowItWorksReplayScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          headerTitleAlign: 'center',
          headerBackTitle: 'Connect',
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
