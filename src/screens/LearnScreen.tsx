import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SupportRequestSheet } from '../components/SupportRequestSheet';
import { LEARN_VIDEOS, QUICK_READS } from '../constants/learn';
import type { CommunityStackParamList } from '../navigation/CommunityStackNavigator';

type Props = NativeStackScreenProps<CommunityStackParamList, 'Learn'>;

export default function LearnScreen(_props: Props) {
  const [requestOpen, setRequestOpen] = useState(false);

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => setRequestOpen(true)}
          style={({ pressed }) => [styles.talkLink, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Talk to someone"
        >
          <Text style={styles.talkText}>Talk to someone</Text>
        </Pressable>

        <Text style={styles.section}>Videos</Text>
        {LEARN_VIDEOS.map((video) => {
          const comingSoon = !video.url;
          const body = (
            <>
              <Text style={styles.cardTitle}>{video.title}</Text>
              {comingSoon ? <Text style={styles.comingSoon}>Coming soon</Text> : null}
            </>
          );
          if (!video.url) {
            return (
              <View
                key={video.id}
                style={styles.card}
                accessibilityLabel={`${video.title}, coming soon`}
              >
                {body}
              </View>
            );
          }
          const url = video.url;
          return (
            <Pressable
              key={video.id}
              onPress={() => {
                void Linking.openURL(url);
              }}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={video.title}
            >
              {body}
            </Pressable>
          );
        })}

        <Text style={[styles.section, styles.sectionFollow]}>Quick reads</Text>
        {QUICK_READS.map((tip) => (
          <View key={tip.title} style={styles.readCard}>
            <Text style={styles.readTitle}>{tip.title}</Text>
            <Text style={styles.readBody}>{tip.body}</Text>
          </View>
        ))}

        <Pressable
          onPress={() => setRequestOpen(true)}
          style={({ pressed }) => [styles.talkLink, styles.talkLinkBottom, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Talk to someone"
        >
          <Text style={styles.talkText}>Talk to someone</Text>
        </Pressable>
      </ScrollView>

      {requestOpen ? (
        <SupportRequestSheet
          onClose={() => setRequestOpen(false)}
          onSent={() => setRequestOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  talkLink: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: 16,
  },
  talkLinkBottom: {
    marginTop: 4,
    marginBottom: 0,
  },
  talkText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007aff',
  },
  section: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#6B6B70',
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionFollow: {
    marginTop: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  comingSoon: {
    fontSize: 13,
    color: '#8e8e93',
  },
  readCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    gap: 6,
  },
  readTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  readBody: {
    fontSize: 15,
    lineHeight: 21,
    color: '#6B6B70',
  },
  pressed: {
    opacity: 0.55,
  },
});
