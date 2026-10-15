import { ActionSheetIOS, Alert, Platform } from 'react-native';

/** Native action sheet. The last choice is always Cancel. */
export function showActionSheet(
  title: string,
  options: string[],
  onPick: (index: number) => void,
) {
  const labels = [...options, 'Cancel'];
  const cancel = labels.length - 1;
  const destructive = options.findIndex((option) => option === 'Clear today');
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: labels,
        cancelButtonIndex: cancel,
        destructiveButtonIndex: destructive >= 0 ? destructive : undefined,
      },
      (index) => {
        if (index < cancel) {
          onPick(index);
        }
      },
    );
    return;
  }
  Alert.alert(
    title,
    undefined,
    [
      ...options.map((text, index) => ({
        text,
        style: (text === 'Clear today' ? 'destructive' : 'default') as
          | 'destructive'
          | 'default',
        onPress: () => onPick(index),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ],
  );
}
