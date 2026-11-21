import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { goalDetailSections, type DetailRow, type DetailSection } from '../lib/goalDetailText';
import { reflectDetailPoint } from '../lib/reflectMayaPrompt';
import type { Goal } from '../types/goal';

function DetailRowView({ row }: { row: DetailRow }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{row.label}</Text>
      <Text style={styles.value}>{row.value}</Text>
    </View>
  );
}

function SectionCard({
  section,
  goal,
  wrapRow,
}: {
  section: DetailSection;
  goal: Goal;
  wrapRow?: (id: 'target' | 'targetEnd', row: ReactNode) => ReactNode;
}) {
  const notes = section.id === 'notes';
  return (
    <View style={styles.card}>
      {section.title ? <Text style={styles.header}>{section.title}</Text> : null}
      {notes ? (
        <Text style={styles.notes}>{section.rows[0]?.value}</Text>
      ) : (
        section.rows.map((row) => {
          const line = <DetailRowView row={row} />;
          if (!wrapRow) {
            return <DetailRowView key={row.label} row={row} />;
          }
          const pointId = reflectDetailPoint(goal, section.id, row.label);
          if (!pointId) {
            return <DetailRowView key={row.label} row={row} />;
          }
          return <View key={row.label}>{wrapRow(pointId, line)}</View>;
        })
      )}
    </View>
  );
}

export default function GoalDetailCards({
  goal,
  wrapRow,
}: {
  goal: Goal;
  wrapRow?: (id: 'target' | 'targetEnd', row: ReactNode) => ReactNode;
}) {
  const { settings } = useSettings();
  const sections = goalDetailSections(goal, settings.weekStart);
  return (
    <View style={styles.list}>
      {sections.map((section) => (
        <SectionCard key={section.id} section={section} goal={goal} wrapRow={wrapRow} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  header: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#6B6B70',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  label: {
    width: 118,
    fontSize: 15,
    color: '#6B6B70',
  },
  value: {
    flex: 1,
    fontSize: 15,
    color: '#111',
  },
  notes: {
    fontSize: 15,
    color: '#111',
    lineHeight: 21,
  },
});
