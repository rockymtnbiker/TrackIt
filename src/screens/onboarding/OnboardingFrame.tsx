import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardSafe } from '../../components/KeyboardSafe';
import { ONBOARDING_STEP_COUNT } from '../../constants/onboarding';

export function OnboardingFrame({
  step,
  keyboard,
  children,
  footer,
}: {
  step: number;
  keyboard?: boolean;
  children: ReactNode;
  footer: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const body = (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 12) },
      ]}
    >
      <ProgressDots step={step} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {children}
      </ScrollView>
      <View style={styles.footer}>{footer}</View>
    </View>
  );

  if (keyboard) {
    return (
      <KeyboardSafe style={styles.screen} keyboardVerticalOffset={0}>
        {body}
      </KeyboardSafe>
    );
  }

  return body;
}

function ProgressDots({ step }: { step: number }) {
  return (
    <View
      style={styles.dots}
      accessibilityRole="text"
      accessibilityLabel={`Step ${step + 1} of ${ONBOARDING_STEP_COUNT}`}
    >
      {Array.from({ length: ONBOARDING_STEP_COUNT }, (_, index) => (
        <View
          key={index}
          style={[styles.dot, index === step ? styles.dotActive : styles.dotIdle]}
        />
      ))}
    </View>
  );
}

export function OnboardingButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function OnboardingSkip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.skipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: '#007aff',
  },
  dotIdle: {
    backgroundColor: '#d1d1d6',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  button: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#007aff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#a8c8f0',
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  skip: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  skipText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
  },
  pressed: {
    opacity: 0.55,
  },
});
