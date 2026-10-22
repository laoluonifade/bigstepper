import { Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

export default function YouScreen() {
  const { user, logout } = useAuth();
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.name}>{user?.displayName ?? 'You'}</Text>
      <Text style={styles.email}>{user?.email}</Text>
      <Pressable style={styles.button} onPress={() => void logout()}>
        <Text style={styles.buttonText}>Log out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, padding: 16 },
  name: { fontSize: 30, fontWeight: '900', color: colors.ink, marginTop: 16 },
  email: { fontSize: 15, color: colors.ink2, marginTop: 4 },
  button: { marginTop: 32, borderWidth: 1, borderColor: colors.ink, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700', color: colors.ink },
});
