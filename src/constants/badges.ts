import type { ComponentProps } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export type BadgeIcon = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type BadgeDefinition = {
  key: string;
  name: string;
  hint: string;
  icon: BadgeIcon;
};

export const BADGES: BadgeDefinition[] = [
  {
    key: 'first_step',
    name: 'First Step',
    hint: 'First log of anything',
    icon: 'shoe-print',
  },
  {
    key: 'reviewer',
    name: 'Reviewer',
    hint: 'First completed weekly review',
    icon: 'clipboard-check-outline',
  },
  {
    key: 'steady_4',
    name: 'Steady',
    hint: 'Weekly reviews 4 weeks in a row',
    icon: 'calendar-week',
  },
  {
    key: 'committed_12',
    name: 'Committed',
    hint: 'Weekly reviews 12 weeks in a row',
    icon: 'medal-outline',
  },
  {
    key: 'perfect_week',
    name: 'Perfect Week',
    hint: 'Any week at 100% done',
    icon: 'star-circle',
  },
  {
    key: 'on_a_roll',
    name: 'On a Roll',
    hint: '4 weeks in a row at 80%+',
    icon: 'fire',
  },
  {
    key: 'finisher',
    name: 'Finisher',
    hint: 'First goal or step marked Done',
    icon: 'flag-checkered',
  },
  {
    key: 'partnered_up',
    name: 'Partnered Up',
    hint: 'First accepted partner',
    icon: 'account-multiple-check',
  },
];

const BY_KEY = new Map(BADGES.map((badge) => [badge.key, badge]));

export function badgeByKey(key: string): BadgeDefinition | null {
  return BY_KEY.get(key) ?? null;
}
