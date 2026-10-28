import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { STATUS_COLORS } from '../constants';
import {
  PAST_DUE_LINK,
  PAST_DUE_PREFIX,
  pastDueStatus,
  type StatusTone,
} from '../lib/statusMessages';

export function StatusLine({
  message,
  tone,
  onSetTargetDate,
  emphasizeLink = false,
  style,
}: {
  message: string;
  tone: StatusTone;
  /** When set, "Set a new target date?" opens the target end date picker. */
  onSetTargetDate?: () => void;
  /** Underline the date phrase when a parent handles the tap. */
  emphasizeLink?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const color = STATUS_COLORS[tone];
  if ((onSetTargetDate || emphasizeLink) && message === pastDueStatus().message) {
    return (
      <Text style={[style, { color }]}>
        {PAST_DUE_PREFIX}
        <Text
          style={styles.link}
          onPress={onSetTargetDate}
          accessibilityRole={onSetTargetDate ? 'button' : undefined}
          accessibilityLabel={onSetTargetDate ? PAST_DUE_LINK : undefined}
        >
          {PAST_DUE_LINK}
        </Text>
      </Text>
    );
  }
  return <Text style={[style, { color }]}>{message}</Text>;
}

const styles = StyleSheet.create({
  link: {
    textDecorationLine: 'underline',
  },
});
