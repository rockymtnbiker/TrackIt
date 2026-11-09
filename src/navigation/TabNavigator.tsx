import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommunityProvider, useCommunity } from '../context/CommunityContext';
import ChatScreen from '../screens/ChatScreen';
import PartnerScreen from '../screens/PartnerScreen';
import DashboardScreen from '../screens/DashboardScreen';
import WeeklyReflectionScreen from '../screens/WeeklyReflectionScreen';
import GoalScreen from '../screens/GoalScreen';
import GoalSetupScreen from '../screens/GoalSetupScreen';
import TodayScreen from '../screens/TodayScreen';
import CommunityStackNavigator from './CommunityStackNavigator';
import GoalsStackNavigator, {
  type ChatParams,
  type GoalRouteParams,
  type TodayStackParamList,
} from './GoalsStackNavigator';

export type RootTabParamList = {
  Today: NavigatorScreenParams<TodayStackParamList> | undefined;
  Goals: undefined;
  Dashboard: NavigatorScreenParams<DashboardStackParamList> | undefined;
  Community: undefined;
};

export type { TodayStackParamList };

export type DashboardStackParamList = {
  DashboardMain: undefined;
  WeeklyReflection: { weekStart: string; readOnly?: boolean };
  Partner: { connectionId: string; name: string; partnerId: string | null };
  Goal: GoalRouteParams;
  Chat: ChatParams;
  StepDetail: { goalId: string };
};

const Tab = createMaterialTopTabNavigator<RootTabParamList>();
const TodayStack = createNativeStackNavigator<TodayStackParamList>();
const DashboardStack = createNativeStackNavigator<DashboardStackParamList>();

/** Keeps the same stack header chrome bottom tabs previously provided. */
function TodayStackNavigator() {
  return (
    <TodayStack.Navigator>
      <TodayStack.Screen
        name="TodayMain"
        component={TodayScreen}
        options={{ headerShown: false, title: 'Do', headerBackTitle: 'Do' }}
      />
      <TodayStack.Screen
        name="GoalSetup"
        component={GoalSetupScreen}
        options={{ title: 'Step 1 of 3', headerTitleAlign: 'center' }}
      />
      <TodayStack.Screen
        name="Goal"
        component={GoalScreen}
        options={{ title: '', headerTitleAlign: 'center' }}
      />
      <TodayStack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ headerTitleAlign: 'center' }}
      />
    </TodayStack.Navigator>
  );
}

function DashboardStackNavigator() {
  return (
    <DashboardStack.Navigator>
      <DashboardStack.Screen
        name="DashboardMain"
        component={DashboardScreen}
        options={{
          headerShown: false,
          title: 'Reflect',
          headerBackTitle: 'Reflect',
        }}
      />
      <DashboardStack.Screen
        name="WeeklyReflection"
        component={WeeklyReflectionScreen}
        options={{
          presentation: 'fullScreenModal',
          title: 'Weekly reflection',
          headerTitleAlign: 'center',
          headerBackVisible: false,
        }}
      />
      <DashboardStack.Screen
        name="Goal"
        component={GoalScreen}
        options={{ title: '', headerTitleAlign: 'center' }}
      />
      <DashboardStack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ headerTitleAlign: 'center' }}
      />
      <DashboardStack.Screen
        name="Partner"
        component={PartnerScreen}
        options={({ route }) => ({
          title: route.params.name,
          headerTitleAlign: 'center',
        })}
      />
    </DashboardStack.Navigator>
  );
}

function ConnectDot() {
  return (
    <View style={styles.dotRing} accessibilityLabel="New activity">
      <View style={styles.dot} />
    </View>
  );
}

function TabScreens() {
  const insets = useSafeAreaInsets();
  const { hasAttention } = useCommunity();
  const tabBarHeight = 49 + insets.bottom;

  return (
    <Tab.Navigator
      initialRouteName="Today"
      tabBarPosition="bottom"
      screenOptions={{
        swipeEnabled: true,
        tabBarShowIcon: true,
        tabBarShowLabel: true,
        tabBarActiveTintColor: Platform.OS === 'ios' ? '#007AFF' : '#007aff',
        tabBarInactiveTintColor: Platform.OS === 'ios' ? '#8E8E93' : '#737373',
        tabBarPressColor: 'transparent',
        tabBarPressOpacity: 0.7,
        tabBarIndicatorStyle: {
          height: 0,
          width: 0,
        },
        tabBarStyle: {
          backgroundColor: Platform.OS === 'ios' ? '#F9F9F9' : '#ffffff',
          borderTopColor: Platform.OS === 'ios' ? '#A7A7AA' : '#e0e0e0',
          borderTopWidth: StyleSheet.hairlineWidth,
          height: tabBarHeight,
          paddingBottom: insets.bottom,
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: -1 },
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          textTransform: 'none',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="Goals"
        component={GoalsStackNavigator}
        options={{
          tabBarLabel: 'Plan',
          tabBarIcon: ({ focused, color }) => (
            <MaterialCommunityIcons
              name={focused ? 'clipboard-edit' : 'clipboard-edit-outline'}
              size={24}
              color={color}
              style={styles.tabIcon}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Today"
        component={TodayStackNavigator}
        options={{
          tabBarLabel: 'Do',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={24}
              color={color}
              style={styles.tabIcon}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Dashboard"
        component={DashboardStackNavigator}
        options={{
          tabBarLabel: 'Reflect',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons
              name={focused ? 'stats-chart' : 'stats-chart-outline'}
              size={24}
              color={color}
              style={styles.tabIcon}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Community"
        component={CommunityStackNavigator}
        options={{
          tabBarLabel: 'Connect',
          tabBarAccessibilityLabel: hasAttention ? 'Connect, new activity' : 'Connect',
          tabBarIcon: ({ focused, color }) => (
            <View style={styles.connectIcon} collapsable={false}>
              <MaterialCommunityIcons
                name={focused ? 'handshake' : 'handshake-outline'}
                size={24}
                color={color}
                style={styles.tabIcon}
              />
              {hasAttention ? <ConnectDot /> : null}
            </View>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function TabNavigator() {
  return (
    <CommunityProvider>
      <TabScreens />
    </CommunityProvider>
  );
}

const styles = StyleSheet.create({
  tabIcon: {
    marginTop: 2,
  },
  connectIcon: {
    overflow: 'visible',
  },
  dotRing: {
    position: 'absolute',
    // 24pt icon, 2pt top margin. About a third of the 10pt dot covers its top-right corner.
    top: -7,
    right: -9,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#007AFF',
  },
});
