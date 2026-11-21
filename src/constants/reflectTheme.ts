import { useColorScheme } from 'react-native';

/**
 * Reflection accent. Maya's chat uses the app's blue, so reflection uses a soft purple.
 * Soft fills are the accent mixed onto white (light) or the grouped dark background (dark).
 */
export const reflectTheme = {
  light: {
    accent: '#6B46C1',
    /** 12% accent on white. */
    accentSoft: '#EDE9F8',
    /** 5% accent on the Goal page gray. */
    pageTint: '#EBE9F4',
    ink: '#1C1C1E',
    muted: '#6B6B70',
    /** App card color. */
    surface: '#FFFFFF',
  },
  dark: {
    accent: '#7C5CBF',
    /** 12% accent on #1C1C1E. */
    accentSoft: '#282431',
    /** 5% accent on #1C1C1E. */
    pageTint: '#211F26',
    ink: '#F2F2F7',
    muted: '#C7C7CC',
    /** Dark card sitting on the grouped background. */
    surface: '#2C2C2E',
  },
} as const;

export type ReflectColors = {
  accent: string;
  accentSoft: string;
  pageTint: string;
  ink: string;
  muted: string;
  surface: string;
};

export function useReflectTheme(): ReflectColors {
  return useColorScheme() === 'dark' ? reflectTheme.dark : reflectTheme.light;
}
