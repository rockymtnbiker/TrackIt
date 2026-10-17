import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootTabParamList } from './TabNavigator';

export const navigationRef = createNavigationContainerRef<RootTabParamList>();
