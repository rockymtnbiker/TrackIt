import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Area keys from src/constants/starters.ts. */
export const AREA_ICONS: Record<string, IconName> = {
  health: 'heart-pulse',
  money: 'cash',
  career: 'briefcase-outline',
  school: 'school-outline',
  spiritual: 'hands-pray',
  relationships: 'account-heart-outline',
  growth: 'sprout-outline',
};
