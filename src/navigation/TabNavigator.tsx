import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  type BottomTabBarProps,
  type BottomTabNavigationEventMap,
  type BottomTabNavigationOptions,
  type BottomTabNavigatorProps,
  type BottomTabTypeBag,
} from '@react-navigation/bottom-tabs';
import {
  CommonActions,
  createNavigatorFactory,
  TabRouter,
  useNavigationBuilder,
  type NavigatorTypeBagBase,
  type ParamListBase,
  type StaticConfig,
  type TabActionHelpers,
  type TabNavigationState,
  type TabRouterOptions,
  type TypedNavigator,
  type NavigatorScreenParams,
} from '@react-navigation/native';
import { SafeAreaProviderCompat } from '@react-navigation/elements';
import { useSharedValue } from 'react-native-reanimated';
import { FloatingTabBar, FloatingTabBarHeightProvider } from './FloatingTabBar';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { CommunityProvider, useCommunity } from '../context/CommunityContext';
import { ReflectMayaProvider } from '../context/ReflectMayaContext';
import ChatScreen from '../screens/ChatScreen';
import MayaFlowScreen from '../screens/MayaFlowScreen';
import PartnerScreen from '../screens/PartnerScreen';
import DashboardScreen from '../screens/DashboardScreen';
import LearnArticleScreen from '../screens/LearnArticleScreen';
import LearnScreen from '../screens/LearnScreen';
import { HowItWorksReplayScreen } from '../screens/onboarding/HowItWorksScreen';
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
  GoalSetup: undefined;
  Maya: undefined;
  Partner: { connectionId: string; name: string; partnerId: string | null };
  Goal: GoalRouteParams;
  Chat: ChatParams;
  Learn: { tab?: 'plan' | 'do' | 'reflect' | 'connect' } | undefined;
  LearnArticle: { id: string };
  HowItWorks: undefined;
};

/**
 * Pages sit side by side in a normal scroll view and follow the finger.
 * The SwiftUI tab pager aborts on iOS 26 when a page holds a native-stack screen.
 */
function SlidingPager({ state, navigation, descriptors }: Omit<BottomTabBarProps, 'insets'>) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const offsetX = useRef(0);
  const widthRef = useRef(0);
  const placed = useRef(false);
  const initialOffset = useRef<{ x: number; y: number } | null>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const progress = useSharedValue(state.index);
  const focused = state.routes[state.index];
  const nestedIndex =
    focused?.state && typeof focused.state.index === 'number' ? focused.state.index : 0;

  if (initialOffset.current == null && frame.width > 0) {
    initialOffset.current = { x: state.index * frame.width, y: 0 };
  }

  useEffect(() => {
    if (frame.width <= 0) {
      return;
    }
    const target = state.index * frame.width;
    if (!placed.current) {
      placed.current = true;
      offsetX.current = target;
      widthRef.current = frame.width;
      return;
    }
    const widthChanged = widthRef.current !== frame.width;
    widthRef.current = frame.width;
    if (!widthChanged && Math.abs(offsetX.current - target) < 2) {
      return;
    }
    offsetX.current = target;
    scrollRef.current?.scrollTo({ x: target, y: 0, animated: !widthChanged });
  }, [frame.width, state.index]);

  const onPagerLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setFrame((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  };

  const onSettle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (frame.width <= 0) {
      return;
    }
    const x = event.nativeEvent.contentOffset.x;
    offsetX.current = x;
    const next = Math.max(
      0,
      Math.min(state.routes.length - 1, Math.round(x / frame.width)),
    );
    const route = state.routes[next];
    if (!route || next === state.index) {
      return;
    }
    navigation.dispatch({
      ...CommonActions.navigate(route.name),
      target: state.key,
    });
  };

  return (
    <SafeAreaProviderCompat style={styles.column}>
    <FloatingTabBarHeightProvider>
    <View style={styles.column}>
      <View style={styles.pager} onLayout={onPagerLayout}>
        {frame.width > 0 && frame.height > 0 ? (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            disableIntervalMomentum
            directionalLockEnabled
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            scrollEnabled={nestedIndex === 0}
            contentInsetAdjustmentBehavior="never"
            contentOffset={initialOffset.current ?? undefined}
            scrollEventThrottle={16}
            onScroll={(event) => {
              if (frame.width <= 0) {
                return;
              }
              progress.value = event.nativeEvent.contentOffset.x / frame.width;
            }}
            onMomentumScrollEnd={onSettle}
            removeClippedSubviews={false}
            style={styles.pager}
          >
            {state.routes.map((route) => (
              <View
                key={route.key}
                collapsable={false}
                style={{ width: frame.width, height: frame.height, overflow: 'hidden' }}
              >
                {descriptors[route.key].render()}
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>
      <FloatingTabBar
        state={state}
        navigation={navigation}
        descriptors={descriptors}
        progress={progress}
      />
    </View>
    </FloatingTabBarHeightProvider>
    </SafeAreaProviderCompat>
  );
}

function SlidingTabNavigator({
  id,
  initialRouteName,
  backBehavior,
  UNSTABLE_routeNamesChangeBehavior,
  children,
  layout,
  screenListeners,
  screenOptions,
  screenLayout,
  UNSTABLE_router,
}: BottomTabNavigatorProps) {
  const { state, descriptors, navigation, NavigationContent } = useNavigationBuilder<
    TabNavigationState<ParamListBase>,
    TabRouterOptions,
    TabActionHelpers<ParamListBase>,
    BottomTabNavigationOptions,
    BottomTabNavigationEventMap
  >(TabRouter, {
    id,
    initialRouteName,
    backBehavior,
    UNSTABLE_routeNamesChangeBehavior,
    children,
    layout,
    screenListeners,
    screenOptions,
    screenLayout,
    UNSTABLE_router,
  });

  return (
    <NavigationContent>
      <SlidingPager state={state} navigation={navigation} descriptors={descriptors} />
    </NavigationContent>
  );
}

function createSlidingTabNavigator<
  const ParamList extends ParamListBase,
  const NavigatorID extends string | undefined = string | undefined,
  const TypeBag extends NavigatorTypeBagBase = BottomTabTypeBag<ParamList, NavigatorID>,
  const Config extends StaticConfig<TypeBag> = StaticConfig<TypeBag>,
>(config?: Config): TypedNavigator<TypeBag, Config> {
  return createNavigatorFactory(SlidingTabNavigator)(config);
}

const Tab = createSlidingTabNavigator<RootTabParamList>();
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
        name="Maya"
        component={MayaFlowScreen}
        options={{
          presentation: 'fullScreenModal',
          title: 'Maya',
          headerTitleAlign: 'center',
          headerBackVisible: false,
        }}
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
      <TodayStack.Screen
        name="Learn"
        component={LearnScreen}
        options={{ title: 'Learn', headerTitleAlign: 'center' }}
      />
      <TodayStack.Screen
        name="LearnArticle"
        component={LearnArticleScreen}
        options={{ title: 'Learn', headerBackTitle: 'Learn', headerTitleAlign: 'center' }}
      />
      <TodayStack.Screen
        name="HowItWorks"
        component={HowItWorksReplayScreen}
        options={{ headerShown: false }}
      />
    </TodayStack.Navigator>
  );
}

function DashboardStackNavigator() {
  return (
    <ReflectMayaProvider>
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
        name="GoalSetup"
        component={GoalSetupScreen}
        options={{ title: 'Step 1 of 3', headerTitleAlign: 'center' }}
      />
      <DashboardStack.Screen
        name="Maya"
        component={MayaFlowScreen}
        options={{
          presentation: 'fullScreenModal',
          title: 'Maya',
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
      <DashboardStack.Screen
        name="Learn"
        component={LearnScreen}
        options={{ title: 'Learn', headerTitleAlign: 'center' }}
      />
      <DashboardStack.Screen
        name="LearnArticle"
        component={LearnArticleScreen}
        options={{ title: 'Learn', headerBackTitle: 'Learn', headerTitleAlign: 'center' }}
      />
      <DashboardStack.Screen
        name="HowItWorks"
        component={HowItWorksReplayScreen}
        options={{ headerShown: false }}
      />
    </DashboardStack.Navigator>
    </ReflectMayaProvider>
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
  const { hasAttention } = useCommunity();

  return (
    <Tab.Navigator
      initialRouteName="Today"
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        lazy: false,
        animation: 'none',
        tabBarActiveTintColor: Platform.OS === 'ios' ? '#007AFF' : '#007aff',
        tabBarInactiveTintColor: Platform.OS === 'ios' ? '#8E8E93' : '#737373',
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
  column: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
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
