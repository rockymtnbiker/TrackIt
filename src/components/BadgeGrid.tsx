import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { BADGES } from '../constants/badges';
import { listEarnedBadges, type EarnedBadge } from '../lib/badges';
import { localCalendarDay } from '../lib/localDate';
import { formatDateMDY } from '../utils/date';

/** Earned and unearned badges. Loads on focus. Does not award badges. */
export function BadgeGrid() {
  const [earnedBadges, setEarnedBadges] = useState<EarnedBadge[]>([]);
  const [badgesLoaded, setBadgesLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void listEarnedBadges()
        .then((rows) => {
          if (!cancelled) {
            setEarnedBadges(rows);
          }
        })
        .catch((error) => {
          console.warn('Failed to load badges', error);
        })
        .finally(() => {
          if (!cancelled) {
            setBadgesLoaded(true);
          }
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const earnedByKey = new Map(earnedBadges.map((badge) => [badge.badgeKey, badge]));

  return (
    <View>
      <Text style={styles.section}>Badges</Text>
      <View style={styles.card}>
        {badgesLoaded ? (
          <View style={styles.badgeGrid}>
            {BADGES.map((badge) => {
              const earned = earnedByKey.get(badge.key);
              const earnedDay = earned ? localCalendarDay(earned.earnedAt) : '';
              const earnedLabel = earnedDay ? formatDateMDY(earnedDay) : '';
              return (
                <View
                  key={badge.key}
                  style={styles.badgeCell}
                  accessibilityLabel={
                    earned
                      ? `${badge.name}, earned ${earnedLabel}`
                      : `${badge.name}, ${badge.hint}`
                  }
                >
                  <MaterialCommunityIcons
                    name={badge.icon}
                    size={32}
                    color={earned ? '#007aff' : '#c7c7cc'}
                  />
                  <Text style={[styles.badgeName, !earned && styles.badgeMuted]}>{badge.name}</Text>
                  <Text style={styles.badgeDetail}>{earned ? earnedLabel : badge.hint}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <ActivityIndicator color="#007aff" style={styles.badgeLoading} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#6B6B70',
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 14,
    overflow: 'hidden',
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  badgeCell: {
    width: '50%',
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  badgeName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    textAlign: 'center',
  },
  badgeMuted: {
    color: '#8e8e93',
  },
  badgeDetail: {
    fontSize: 12,
    lineHeight: 16,
    color: '#8e8e93',
    textAlign: 'center',
  },
  badgeLoading: {
    margin: 16,
  },
});
