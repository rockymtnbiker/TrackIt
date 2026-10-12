import { StyleSheet, Text, View } from 'react-native';

export default function PartnerScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.text}>Shared goals coming next.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f2f2f7',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  text: {
    fontSize: 17,
    color: '#6b6b70',
    textAlign: 'center',
  },
});
