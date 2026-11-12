import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LEARN_ITEMS, type LearnItem, type LearnTab } from '../constants/learn';

type Props = {
  navigation: {
    navigate(screen: 'LearnArticle', params: { id: string }): void;
    navigate(screen: 'HowItWorks'): void;
  };
  route: { params?: { tab?: LearnTab } };
};

function openItem(
  navigation: Props['navigation'],
  item: LearnItem,
) {
  if (item.kind === 'howItWorks') {
    navigation.navigate('HowItWorks');
    return;
  }
  navigation.navigate('LearnArticle', { id: item.id });
}

export default function LearnScreen({ navigation, route }: Props) {
  const tab = route.params?.tab;
  const sections = tab
    ? [
        {
          title: 'For this page',
          items: LEARN_ITEMS.filter((item) => item.tabs.includes(tab)),
        },
        {
          title: 'Everything else',
          items: LEARN_ITEMS.filter((item) => !item.tabs.includes(tab)),
        },
      ]
    : [{ title: 'All topics', items: LEARN_ITEMS }];

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.placeholder}>Placeholder: more topics and videos are coming.</Text>
        {sections.map((section) =>
          section.items.length === 0 ? null : (
            <View key={section.title}>
              <Text style={styles.section}>{section.title}</Text>
              <View style={styles.card}>
                {section.items.map((item, index) => (
                  <View key={item.id}>
                    {index > 0 ? <View style={styles.separator} /> : null}
                    <Pressable
                      onPress={() => openItem(navigation, item)}
                      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.title}. ${item.summary}`}
                    >
                      <View style={styles.rowText}>
                        <Text style={styles.title}>{item.title}</Text>
                        <Text style={styles.summary} numberOfLines={1}>
                          {item.summary}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#c7c7cc" />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ),
        )}
      </ScrollView>
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
  placeholder: {
    fontSize: 13,
    lineHeight: 18,
    color: '#8e8e93',
    marginBottom: 16,
  },
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
    marginBottom: 24,
    overflow: 'hidden',
  },
  row: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 17,
    color: '#111',
  },
  summary: {
    fontSize: 15,
    lineHeight: 20,
    color: '#8e8e93',
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
