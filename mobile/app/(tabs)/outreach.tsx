import { View, Text, StyleSheet } from 'react-native';

export default function OutreachScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Carrier Outreach</Text>
      <Text style={styles.sub}>Your leads will appear here</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '600', color: '#1a1033' },
  sub: { fontSize: 14, color: '#6b7280', marginTop: 8 },
});