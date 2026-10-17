import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommunityProvider, useCommunity } from '../context/CommunityContext';
import CommentThreadScreen from '../screens/CommentThreadScreen';
import DashboardScreen from '../screens/DashboardScreen';
import GoalScreen from '../screens/GoalScreen';
import TodayScreen from '../screens/TodayScreen';
import CommunityStackNavigator from './CommunityStackNavigator';
import GoalsStackNavigator, {
  type CommentThreadParams,
  type GoalRouteParams,
  type TodayStackParamList,
} from './GoalsStackNavigator';

export type RootTabParamList = {
  Today: NavigatorScreenParams<TodayStackParamList> | undefined;
  Goals: undefined;
  Dashboard: undefined;
  Community: undefined;
};

export type { TodayStackParamList };

export type DashboardStackParamList = {
  DashboardMain: undefined;
  Goal: GoalRouteParams;
  StepDetail: { goalId: string };
  Comments: CommentThreadParams;
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
        name="Goal"
        component={GoalScreen}
        options={{ title: '', headerTitleAlign: 'center' }}
      />
      <TodayStack.Screen
        name="Comments"
        component={CommentThreadScreen}
        options={{ title: 'Comments', headerTitleAlign: 'center' }}
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
          title: 'Review',
          headerBackTitle: 'Review',
        }}
      />
      <DashboardStack.Screen
        name="Goal"
        component={GoalScreen}
        options={{ title: '', headerTitleAlign: 'center' }}
      />
      <DashboardStack.Screen
        name="Comments"
        component={CommentThreadScreen}
        options={{ title: 'Comments', headerTitleAlign: 'center' }}
      />
    </DashboardStack.Navigator>
  );
}

function InviteBadge({ count }: { count: number }) {
  const label = count > 99 ? '99+' : String(count);
  return (
    <View style={styles.badge} accessibilityLabel={`${label} incoming invites`}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function TabScreens() {
  const insets = useSafeAreaInsets();
  const { incomingCount } = useCommunity();
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
          tabBarLabel: 'Review',
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
          tabBarLabel: 'Community',
          tabBarAccessibilityLabel:
            incomingCount > 0
              ? `Community, ${incomingCount} incoming invites`
              : 'Community',
          tabBarBadge:
            incomingCount > 0 ? () => <InviteBadge count={incomingCount} /> : undefined,
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons
              name="account-group"
              size={24}
              color={color}
              style={styles.tabIcon}
            />
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
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
