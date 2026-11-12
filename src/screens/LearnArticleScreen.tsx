import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { learnItem } from '../constants/learn';

type Props = {
  route: { params: { id: string } };
};

export default function LearnArticleScreen({ route }: Props) {
  const item = learnItem(route.params.id);
  const body = item?.kind === 'text' ? (item.body ?? item.summary) : '';

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.placeholder}>Placeholder: more topics and videos are coming.</Text>
        {item && item.kind === 'text' ? (
          <>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{body}</Text>
          </>
        ) : (
          <Text style={styles.body}>That topic isn't available.</Text>
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
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },
  body: {
    fontSize: 17,
    lineHeight: 24,
    color: '#111',
  },
});
