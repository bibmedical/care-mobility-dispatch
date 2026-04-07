import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DriverRuntime } from '../hooks/useDriverRuntime';
import { driverTheme } from '../components/driver/driverTheme';

type Props = {
  runtime: DriverRuntime;
};

export const DriverLoginScreen = ({ runtime }: Props) => {
  return (
    <KeyboardAvoidingView style={styles.kavContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.heroShell}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>CM</Text>
          </View>
          <Text style={styles.heroTitle}>Driver Access</Text>
          <Text style={styles.heroSubtitle}>Login with the same driver account used in the portal.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>Driver Login</Text>
          <Text style={styles.cardTitle}>Sign in</Text>
          <Text style={styles.cardText}>Use the same driver credentials you use on the web portal.</Text>
          {runtime.isRestoringSession ? (
            <View style={styles.restoreNotice}>
              <ActivityIndicator color="#3263ff" />
              <Text style={styles.restoreNoticeText}>Checking saved session...</Text>
            </View>
          ) : null}
          <TextInput value={runtime.driverCode} onChangeText={runtime.setDriverCode} placeholder="Email" placeholderTextColor="#7f8ca8" style={styles.input} autoCapitalize="none" keyboardType="email-address" />
          <TextInput value={runtime.password} onChangeText={runtime.setPassword} placeholder="Password" placeholderTextColor="#7f8ca8" style={styles.input} secureTextEntry autoCapitalize="none" />
          {runtime.authError ? <Text style={styles.errorText}>{runtime.authError}</Text> : null}
          <Pressable style={[styles.primaryButton, runtime.isSigningIn ? styles.primaryButtonDisabled : null]} onPress={() => void runtime.signIn()} disabled={runtime.isSigningIn}>
            {runtime.isSigningIn ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Open Driver App</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  kavContainer: {
    flex: 1,
    backgroundColor: driverTheme.colors.appBg
  },
  scrollContent: {
    padding: 20,
    gap: 16,
    flexGrow: 1,
    justifyContent: 'center'
  },
  heroShell: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.sm,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  heroBadge: {
    width: 64,
    height: 64,
    borderRadius: driverTheme.radius.sm,
    backgroundColor: driverTheme.colors.headerBg,
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroBadgeText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800'
  },
  heroTitle: {
    color: driverTheme.colors.text,
    fontSize: 30,
    fontWeight: '800'
  },
  heroSubtitle: {
    color: driverTheme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 21
  },
  card: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.sm,
    padding: 20,
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    gap: 14
  },
  cardEyebrow: {
    color: driverTheme.colors.primaryText,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 11,
    fontWeight: '700'
  },
  cardTitle: {
    color: driverTheme.colors.text,
    fontSize: 28,
    fontWeight: '700'
  },
  cardText: {
    color: driverTheme.colors.textMuted,
    lineHeight: 21
  },
  restoreNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6
  },
  restoreNoticeText: {
    color: driverTheme.colors.textMuted
  },
  input: {
    backgroundColor: driverTheme.colors.surfaceMuted,
    borderColor: driverTheme.colors.border,
    borderWidth: 1,
    color: driverTheme.colors.text,
    borderRadius: driverTheme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16
  },
  primaryButton: {
    backgroundColor: driverTheme.colors.primary,
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
  errorText: {
    color: '#b03050'
  }
});