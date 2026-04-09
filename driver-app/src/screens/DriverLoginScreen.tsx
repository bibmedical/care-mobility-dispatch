import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DriverRuntime } from '../hooks/useDriverRuntime';
import { driverTheme } from '../components/driver/driverTheme';

const isLocalPasswordlessDriverLoginEnabled = __DEV__;

type Props = {
  runtime: DriverRuntime;
};

export const DriverLoginScreen = ({ runtime }: Props) => {
  return (
    <KeyboardAvoidingView style={styles.kavContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.loginLogoWrap}>
          <Image source={require('../../assets/logonew.png')} style={styles.loginLogo} resizeMode="contain" />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>Driver Login</Text>
          <Text style={styles.cardTitle}>Sign in</Text>
          {runtime.isRestoringSession ? (
            <View style={styles.restoreNotice}>
              <ActivityIndicator color="#3263ff" />
              <Text style={styles.restoreNoticeText}>Checking saved session...</Text>
            </View>
          ) : null}
          <TextInput value={runtime.driverCode} onChangeText={runtime.setDriverCode} placeholder="Email" placeholderTextColor="#7f8ca8" style={styles.input} autoCapitalize="none" keyboardType="email-address" />
          <TextInput value={runtime.password} onChangeText={runtime.setPassword} placeholder={isLocalPasswordlessDriverLoginEnabled ? 'Password optional in local app' : 'Password'} placeholderTextColor="#7f8ca8" style={styles.input} secureTextEntry autoCapitalize="none" />
          {runtime.authError ? <Text style={styles.errorText}>{runtime.authError}</Text> : null}
          <Pressable style={[styles.primaryButton, runtime.isSigningIn ? styles.primaryButtonDisabled : null]} onPress={() => void runtime.signIn()} disabled={runtime.isSigningIn}>
            {runtime.isSigningIn ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Log In</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  kavContainer: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  scrollContent: {
    padding: 20,
    paddingTop: 10,
    gap: 16,
    flexGrow: 1,
    justifyContent: 'flex-start'
  },
  card: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.sm,
    padding: 20,
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    gap: 14
  },
  loginLogoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    paddingBottom: 2
  },
  loginLogo: {
    width: 300,
    height: 180,
    opacity: 0.96
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
  errorText: {
    color: '#b03050'
  }
});