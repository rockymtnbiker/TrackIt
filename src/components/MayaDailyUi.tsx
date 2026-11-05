import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MAYA_DAILY } from '../constants/maya/daily';

export function MayaDailyCard({
  text,
  onDismiss,
}: {
  text: string;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>M</Text>
      </View>
      <Text style={styles.line}>{text}</Text>
      <Pressable
        onPress={onDismiss}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={MAYA_DAILY.dismiss}
      >
        <Text style={styles.dismiss}>×</Text>
      </Pressable>
    </View>
  );
}

export function MayaToast({ text, bottom }: { text: string; bottom: number }) {
  return (
    <View pointerEvents="none" style={[styles.toastWrap, { bottom }]}>
      <View style={styles.toast}>
        <Text style={styles.toastText}>{text}</Text>
      </View>
    </View>
  );
}

export function MayaNudgeSheet({
  text,
  onInvite,
  onClose,
}: {
  text: string;
  onInvite: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.dismissArea}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={MAYA_DAILY.notNow}
        />
        <View style={styles.sheet}>
          <Text style={styles.sheetText}>{text}</Text>
          <Pressable
            onPress={onInvite}
            style={({ pressed }) => [styles.invite, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={MAYA_DAILY.invite}
          >
            <Text style={styles.inviteText}>{MAYA_DAILY.invite}</Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.later, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={MAYA_DAILY.notNow}
          >
            <Text style={styles.laterText}>{MAYA_DAILY.notNow}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#007aff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  line: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    color: '#111',
  },
  dismiss: {
    fontSize: 22,
    lineHeight: 24,
    color: '#8e8e93',
    paddingHorizontal: 4,
  },
  toastWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  toast: {
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  toastText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 10,
  },
  sheetText: {
    fontSize: 17,
    lineHeight: 24,
    color: '#111',
    marginBottom: 6,
  },
  invite: {
    backgroundColor: '#007aff',
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  later: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterText: {
    color: '#007aff',
    fontSize: 17,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.55,
  },
});
