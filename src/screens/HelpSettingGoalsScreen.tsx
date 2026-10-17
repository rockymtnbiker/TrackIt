import { ScrollView, StyleSheet, Text, View } from 'react-native';

const TIPS: { title: string; body: string }[] = [
  {
    title: 'Write it down.',
    body: 'A goal you write down is a goal you can see, plan and check.',
  },
  {
    title: 'Make it measurable.',
    body: '"Get in shape" is a wish. "Run 12 miles a week" is a goal you can track.',
  },
  {
    title: 'Know your why.',
    body: 'On hard days, your reason matters more than your plan. Add it to every big goal.',
  },
  {
    title: 'Set a deadline.',
    body: 'A date turns "someday" into a pace you can keep.',
  },
  {
    title: 'Break it down.',
    body: 'Big goals happen one small step at a time. Split anything that feels too big.',
  },
  {
    title: 'Plan your week.',
    body: "Each week, decide which days you'll work on it. Plans can move; that's fine.",
  },
  {
    title: 'Track it daily.',
    body: 'A quick log keeps your streak alive and shows you the truth.',
  },
  {
    title: 'Review every week.',
    body: "Look at what worked, what didn't, and adjust. Small corrections add up.",
  },
  {
    title: 'Get a partner.',
    body: 'Sharing a goal with someone makes you far more likely to follow through.',
  },
];

export default function HelpSettingGoalsScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {TIPS.map((tip) => (
        <View key={tip.title} style={styles.card}>
          <Text style={styles.title}>{tip.title}</Text>
          <Text style={styles.body}>{tip.body}</Text>
        </View>
      ))}
      <Text style={styles.footer}>Videos coming soon.</Text>
    </ScrollView>
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    gap: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    color: '#6B6B70',
  },
  footer: {
    fontSize: 13,
    color: '#8e8e93',
    textAlign: 'center',
    marginTop: 8,
  },
});
