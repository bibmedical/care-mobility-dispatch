import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DriverRuntime } from '../hooks/useDriverRuntime';
import { driverTheme } from '../components/driver/driverTheme';

type Props = {
  runtime: DriverRuntime;
};

export const DriverPasswordResetScreen = ({ runtime }: Props) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = async () => {
    const normalizedPassword = String(newPassword || '').trim();
    if (normalizedPassword.length < 6) {
      setLocalError('Password must be at least 6 characters long.');
      return;
    }
    if (normalizedPassword !== String(confirmPassword || '').trim()) {
      setLocalError('Passwords do not match.');
      return;
    }

    setLocalError('');
    await runtime.changeDriverPassword(normalizedPassword);
  };

  return <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Password Update Required</Text>
        <Text style={styles.title}>Change your driver password</Text>
        <Text style={styles.body}>This account must save a new password before entering the app. Dispatch can force it manually, and passwords now expire every 90 days.</Text>
        <TextInput value={newPassword} onChangeText={setNewPassword} placeholder="New password" placeholderTextColor="#7f8ca8" style={styles.input} secureTextEntry autoCapitalize="none" />
        <TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm new password" placeholderTextColor="#7f8ca8" style={styles.input} secureTextEntry autoCapitalize="none" />
        {localError ? <Text style={styles.errorText}>{localError}</Text> : null}
        {runtime.passwordChangeError ? <Text style={styles.errorText}>{runtime.passwordChangeError}</Text> : null}
        <Pressable style={[styles.primaryButton, runtime.isChangingPassword ? styles.primaryButtonDisabled : null]} onPress={() => void handleSubmit()} disabled={runtime.isChangingPassword}>
          {runtime.isChangingPassword ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Save New Password</Text>}
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => void runtime.signOut()}>
          <Text style={styles.secondaryButtonText}>Logout</Text>
        </Pressable>
      </View>
    </ScrollView>;
};

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: driverTheme.colors.appBg
  },
  card: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.md,
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    padding: 20,
    gap: 14
  },
  eyebrow: {
    color: '#b45309',
    textTransform: 'uppercase',
    fontWeight: '800',
    fontSize: 12
  },
  title: {
    color: driverTheme.colors.text,
    fontSize: 26,
    fontWeight: '800'
  },
  body: {
    color: driverTheme.colors.textMuted,
    lineHeight: 20
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: driverTheme.colors.border,
    borderWidth: 1,
    color: driverTheme.colors.text,
    borderRadius: driverTheme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16
  },
  primaryButton: {
    backgroundColor: '#1f2937',
    borderRadius: driverTheme.radius.sm,
    paddingVertical: 15,
    alignItems: 'center'
  },
  primaryButtonDisabled: {
    opacity: 0.7
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800'
  },
  secondaryButton: {
    borderRadius: driverTheme.radius.sm,
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    paddingVertical: 14,
    alignItems: 'center'
  },
  secondaryButtonText: {
    color: driverTheme.colors.text,
    fontWeight: '800'
  },
  errorText: {
    color: '#b03050'
  }
});