import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { router } from 'expo-router';
import { client } from '../src/api/client';
import { useAuthStore } from '../src/store/auth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await client.post('/api/auth/login', { email, password });
      login(res.data.token, res.data.user);
      router.replace('/(tabs)/outreach');
    } catch (e: any) {
      Alert.alert('Login failed', e?.response?.data?.detail || 'Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.logoBox}>
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>P</Text>
          </View>
          <Text style={styles.logoName}>
            Proxie<Text style={styles.logoAccent}>Agent</Text>
          </Text>
          <Text style={styles.logoSub}>by Conversion Interactive</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign in to your account</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#9ca3af"
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="white" />
              : <Text style={styles.buttonText}>Sign In</Text>
            }
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>ProxieAgent.ai</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#534AB7' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  logoBox: { alignItems: 'center', marginBottom: 32 },
  logoMark: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: '#26215C',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  logoMarkText: { color: '#AFA9EC', fontSize: 28, fontWeight: '700' },
  logoName: { fontSize: 28, fontWeight: '600', color: 'white', letterSpacing: -0.5 },
  logoAccent: { color: '#AFA9EC' },
  logoSub: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4, letterSpacing: 0.5 },
  card: {
    backgroundColor: 'white', borderRadius: 16,
    padding: 24, marginBottom: 24,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1a1033', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8,
    padding: 12, fontSize: 14, color: '#111827', marginBottom: 16,
    backgroundColor: '#f9fafb',
  },
  button: {
    backgroundColor: '#534AB7', borderRadius: 8,
    padding: 14, alignItems: 'center', marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: 'white', fontSize: 15, fontWeight: '600' },
  footer: { textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12 },
});