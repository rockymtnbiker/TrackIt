import type { ImageSourcePropType } from 'react-native';

export type Concept = {
  key: string;
  title: string;
  description: string;
  /** Set when artwork is ready. Null shows a placeholder. */
  image: ImageSourcePropType | null;
};

export const CONCEPTS: Concept[] = [
  {
    key: 'teams',
    title: 'Teams & groups',
    description: 'A coach, team or family sharing goals in one place.',
    image: null,
  },
  {
    key: 'find_coach',
    title: 'Find a coach',
    description: 'Browse coaches, follow their tips and book a session.',
    image: null,
  },
  {
    key: 'club',
    title: 'Achievers club',
    description: 'A circle for people who stick with the system.',
    image: null,
  },
  {
    key: 'points',
    title: 'Points',
    description: 'Earn points for progress and reach new levels.',
    image: null,
  },
  {
    key: 'auto_import',
    title: 'Auto-import',
    description: 'Pull workouts and stats from Strava and other apps.',
    image: null,
  },
];
