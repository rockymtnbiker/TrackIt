import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  title: string;
  subtitle: string;
  right?: ReactNode;
  /** Opens Learn for this tab. Shown just after the title. */
  help?: () => void;
};

export function PageHeader({ title, subtitle, right, help }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      <View style={styles.row}>
        <View style={styles.text}>
          <View style={styles.titleLine}>
            <Text style={styles.title}>{title}</Text>
            {help ? (
              <Pressable
                onPress={help}
                accessibilityRole="button"
                accessibilityLabel="Learn"
                hitSlop={10}
                style={styles.helpButton}
              >
                <Ionicons name="help-circle-outline" size={20} color="#8e8e93" />
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  title: {
    flexShrink: 1,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    color: '#111',
  },
  helpButton: {
    width: 36,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 20,
    color: '#8e8e93',
  },
});
