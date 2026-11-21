import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useReflectTheme } from '../constants/reflectTheme';

/** Avatar beside her bubbles. Exit, when present, sits at the top right. */
export function MayaReflectFrame({
  trailing,
  children,
}: {
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const theme = useReflectTheme();
  return (
    <View style={styles.frame}>
      <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
        <Text style={styles.avatarText}>M</Text>
      </View>
      <View style={styles.main}>{children}</View>
      {trailing}
    </View>
  );
}

/** One speech bubble. Later bubbles in the same turn stack with a gap. */
export function MayaBubble({
  continued = false,
  children,
}: {
  continued?: boolean;
  children: ReactNode;
}) {
  const theme = useReflectTheme();
  return (
    <View
      style={[
        styles.bubble,
        continued && styles.continued,
        { backgroundColor: theme.surface },
      ]}
    >
      {children}
    </View>
  );
}

/** A paragraph inside a bubble. Follow-on lines get space above them. */
export function MayaLine({
  follow = false,
  bullet = false,
  children,
}: {
  follow?: boolean;
  /** A step line in a list. Tighter than a new paragraph. */
  bullet?: boolean;
  children: string;
}) {
  const theme = useReflectTheme();
  return (
    <Text
      style={[
        styles.line,
        bullet ? styles.lineBullet : follow ? styles.lineFollow : null,
        { color: theme.ink },
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  frame: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
    gap: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  bubble: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 17,
    borderBottomRightRadius: 17,
    borderBottomLeftRadius: 17,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  continued: {
    marginTop: 10,
  },
  line: {
    fontSize: 15,
    lineHeight: 20.25,
  },
  lineFollow: {
    marginTop: 8,
  },
  lineBullet: {
    marginTop: 4,
  },
});
