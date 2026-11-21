import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useFloatingTabBarHeight } from '../navigation/FloatingTabBar';
import { listBlockedMembers, unblockMember, type BlockedMember } from '../lib/blocksApi';
import { groupErrorMessage } from '../lib/groupsApi';

export default function BlockedMembersScreen() {
  const tabBarHeight = useFloatingTabBarHeight();
  const [members, setMembers] = useState<BlockedMember[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers(await listBlockedMembers());
    } catch (cause) {
      setMembers([]);
      Alert.alert('Could not load', groupErrorMessage(cause, 'Blocked members were not loaded.'));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const unblock = async (member: BlockedMember) => {
    setBusyId(member.userId);
    try {
      await unblockMember(member.userId);
      setMembers((current) => (current ?? []).filter((item) => item.userId !== member.userId));
    } catch (cause) {
      Alert.alert('Could not unblock', groupErrorMessage(cause, 'This person was not unblocked.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 32 + tabBarHeight }}>
      {members == null ? (
        <ActivityIndicator color="#007aff" style={styles.loading} />
      ) : members.length === 0 ? (
        <Text style={styles.empty}>No blocked members.</Text>
      ) : (
        <View style={styles.card}>
          {members.map((member, index) => (
            <View key={member.userId}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <View style={styles.row}>
                <Text style={styles.name} numberOfLines={1}>
                  {member.displayName}
                </Text>
                {busyId === member.userId ? (
                  <ActivityIndicator color="#007aff" />
                ) : (
                  <Pressable
                    onPress={() => void unblock(member)}
                    style={({ pressed }) => pressed && styles.pressed}
                    accessibilityRole="button"
                    accessibilityLabel={`Unblock ${member.displayName}`}
                  >
                    <Text style={styles.unblock}>Unblock</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  loading: {
    marginTop: 24,
  },
  empty: {
    margin: 24,
    fontSize: 16,
    color: '#8e8e93',
    textAlign: 'center',
  },
  card: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    minHeight: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  name: {
    flex: 1,
    fontSize: 17,
    color: '#111',
  },
  unblock: {
    fontSize: 17,
    color: '#007aff',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e5ea',
    marginLeft: 16,
  },
  pressed: {
    opacity: 0.55,
  },
});
