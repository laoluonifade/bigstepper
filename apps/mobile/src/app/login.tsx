import type { AuthResponse } from '@jump/shared/types';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

export default function LoginScreen() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => post<AuthResponse>('/auth/login', { email: email.trim(), password }),
    onSuccess: auth.authenticate,
  });

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <Text style={styles.brand}>Jump</Text>
        <Text style={styles.lede}>Log in to keep moving.</Text>
        {auth.status === 'unreachable' && (
          <Pressable onPress={auth.retry}>
            <Text style={styles.error}>Can’t reach Jump. Tap to retry.</Text>
          </Pressable>
        )}
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.ink3}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.ink3}
          secureTextEntry
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={() => login.mutate()}
        />
        {login.error && <Text style={styles.error}>{login.error.message}</Text>}
        <Pressable style={styles.button} disabled={login.isPending || !email || !password} onPress={() => login.mutate()}>
          {login.isPending ? <ActivityIndicator color={colors.paper} /> : <Text style={styles.buttonText}>Log in</Text>}
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  brand: { fontSize: 44, fontWeight: '900', color: colors.ink, letterSpacing: -1 },
  lede: { fontSize: 16, color: colors.ink2, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: colors.ink },
  error: { color: colors.bad, fontSize: 14 },
  button: { backgroundColor: colors.ink, borderRadius: 999, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: colors.paper, fontSize: 16, fontWeight: '700' },
});
