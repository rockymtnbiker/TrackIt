import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN, ONBOARDING } from '../../constants/onboarding';
import { getDisplayName, saveDisplayName } from '../../lib/profileApi';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStackNavigator';
import { OnboardingButton, OnboardingFrame } from './OnboardingFrame';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Name'>;

const copy = ONBOARDING.name;

export default function NameScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDisplayName()
      .then((value) => {
        if (!cancelled) {
          setName(value.slice(0, DISPLAY_NAME_MAX));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(copy.loadError);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmed = name.trim();
  const canSave =
    ready &&
    !saving &&
    trimmed.length >= DISPLAY_NAME_MIN &&
    trimmed.length <= DISPLAY_NAME_MAX;

  const save = () => {
    if (!canSave) {
      return;
    }
    setSaving(true);
    setError(null);
    void saveDisplayName(trimmed)
      .then(() => {
        navigation.navigate('FirstGoal');
      })
      .catch((saveError: unknown) => {
        setError(saveError instanceof Error && saveError.message ? saveError.message : copy.saveError);
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <OnboardingFrame
      step={2}
      keyboard
      footer={<OnboardingButton label={copy.next} onPress={save} disabled={!canSave} />}
    >
      <View style={styles.body}>
        <Text style={styles.title}>{copy.title}</Text>
        {ready ? (
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (error) {
                setError(null);
              }
            }}
            placeholder={copy.placeholder}
            placeholderTextColor="#8e8e93"
            maxLength={DISPLAY_NAME_MAX}
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            editable={!saving}
            returnKeyType="done"
            onSubmitEditing={save}
          />
        ) : (
          <ActivityIndicator color="#007aff" style={styles.loading} />
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  body: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 20,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    minHeight: 50,
    paddingHorizontal: 14,
    fontSize: 17,
    color: '#111',
  },
  loading: {
    minHeight: 50,
  },
  error: {
    fontSize: 14,
    color: '#c62828',
    textAlign: 'center',
  },
});
