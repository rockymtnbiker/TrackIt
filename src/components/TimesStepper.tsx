import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  hint?: string;
};

const REPEAT_DELAY_MS = 350;
const REPEAT_EVERY_MS = 80;

export function TimesStepper({ label, value, min, max, onChange, hint }: Props) {
  const valueRef = useRef(value);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  valueRef.current = value;

  const stop = () => {
    if (delayRef.current) {
      clearTimeout(delayRef.current);
      delayRef.current = null;
    }
    if (repeatRef.current) {
      clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
  };

  useEffect(() => stop, []);

  const bump = (delta: number) => {
    const next = Math.min(max, Math.max(min, valueRef.current + delta));
    if (next === valueRef.current) {
      stop();
      return;
    }
    valueRef.current = next;
    onChange(next);
  };

  const start = (delta: number) => {
    stop();
    bump(delta);
    delayRef.current = setTimeout(() => {
      repeatRef.current = setInterval(() => bump(delta), REPEAT_EVERY_MS);
    }, REPEAT_DELAY_MS);
  };

  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          onPressIn={() => start(-1)}
          onPressOut={stop}
          disabled={atMin}
          style={({ pressed }) => [
            styles.button,
            atMin && styles.buttonDisabled,
            pressed && !atMin && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Text style={styles.buttonText}>−</Text>
        </Pressable>
        <Text style={styles.value}>{value}</Text>
        <Pressable
          onPressIn={() => start(1)}
          onPressOut={stop}
          disabled={atMax}
          style={({ pressed }) => [
            styles.button,
            atMax && styles.buttonDisabled,
            pressed && !atMax && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <Text style={styles.buttonText}>+</Text>
        </Pressable>
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    color: '#8e8e93',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.35,
  },
  buttonText: {
    fontSize: 22,
    fontWeight: '500',
    color: '#007aff',
  },
  value: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: '#1c1c1e',
  },
  hint: {
    fontSize: 13,
    color: '#8e8e93',
  },
  pressed: {
    opacity: 0.55,
  },
});
