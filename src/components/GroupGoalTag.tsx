import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { loadGroupGoalLabels, type GroupGoalLabel } from '../lib/groupsApi';

export function useGroupGoalLabels(
  ids: Array<string | null | undefined>,
): Map<string, GroupGoalLabel> {
  const key = [...new Set(ids.filter((id): id is string => Boolean(id)))].sort().join(',');
  const [labels, setLabels] = useState<Map<string, GroupGoalLabel>>(new Map());

  useEffect(() => {
    if (!key) {
      setLabels(new Map());
      return;
    }
    let cancel = false;
    void loadGroupGoalLabels(key.split(',')).then((next) => {
      if (!cancel) {
        setLabels(next);
      }
    });
    return () => {
      cancel = true;
    };
  }, [key]);

  return labels;
}

export function GroupGoalTag({ name }: { name: string }) {
  return <Text style={styles.tag}>{`👥 ${name}`}</Text>;
}

const styles = StyleSheet.create({
  tag: {
    fontSize: 13,
    color: '#8e8e93',
    flexShrink: 1,
  },
});
