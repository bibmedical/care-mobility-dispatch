import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useMemo, useState } from 'react';
import { DriverRuntime } from '../hooks/useDriverRuntime';
import { driverTheme } from '../components/driver/driverTheme';
import { DRIVER_APP_CONFIG } from '../config/driverAppConfig';

const isLocalPasswordlessDriverLoginEnabled = __DEV__;

type Props = {
  runtime: DriverRuntime;
};

export const DriverLoginScreen = ({ runtime }: Props) => {
  const { width } = useWindowDimensions();
  const horizontalPadding = width < 380 ? 16 : 20;
  const cardMaxWidth = Math.min(520, Math.max(320, width - horizontalPadding * 2));
  const logoWidth = Math.min(width - horizontalPadding * 2, 320);
  const [applicantName, setApplicantName] = useState('');
  const [applicantPhone, setApplicantPhone] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [applicantCity, setApplicantCity] = useState('');
  const [applicantExperience, setApplicantExperience] = useState('');
  const [applicationStatus, setApplicationStatus] = useState('');
  const [applicationError, setApplicationError] = useState('');
  const [isSubmittingApplication, setIsSubmittingApplication] = useState(false);
  const canSubmitApplication = useMemo(() => {
    return Boolean(applicantName.trim() && applicantPhone.trim() && applicantEmail.trim() && applicantCity.trim() && applicantExperience.trim());
  }, [applicantCity, applicantEmail, applicantExperience, applicantName, applicantPhone]);

  const submitApplication = async () => {
    if (!canSubmitApplication || isSubmittingApplication) return;
    setApplicationError('');
    setApplicationStatus('');
    setIsSubmittingApplication(true);
    try {
      const response = await fetch(`${DRIVER_APP_CONFIG.apiBaseUrl}/api/mobile/driver-application`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fullName: applicantName,
          phone: applicantPhone,
          email: applicantEmail,
          city: applicantCity,
          experience: applicantExperience
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Unable to submit application right now.');
      }
      setApplicationStatus('Application sent. Dispatch can review it now.');
      setApplicantName('');
      setApplicantPhone('');
      setApplicantEmail('');
      setApplicantCity('');
      setApplicantExperience('');
    } catch (error) {
      setApplicationError(error instanceof Error ? error.message : 'Unable to submit application right now.');
    } finally {
      setIsSubmittingApplication(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.kavContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPadding }]} keyboardShouldPersistTaps="handled">
        <View style={styles.loginLogoWrap}>
          <Image source={require('../../assets/logonew.png')} style={[styles.loginLogo, { width: logoWidth }]} resizeMode="contain" />
        </View>

        <View style={[styles.card, { maxWidth: cardMaxWidth }]}>
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

          <View style={styles.applySection}>
            <Text style={styles.applyEyebrow}>Apply Here</Text>
            <Text style={styles.applyTitle}>Driver job application</Text>
            <Text style={styles.applyText}>New drivers can apply here before logging in. Fill out the form in English and send it directly to dispatch.</Text>
            <TextInput value={applicantName} onChangeText={text => {
              setApplicantName(text);
              if (applicationError) setApplicationError('');
            }} placeholder="Full name" placeholderTextColor="#7f8ca8" style={styles.input} />
            <TextInput value={applicantPhone} onChangeText={text => {
              setApplicantPhone(text);
              if (applicationError) setApplicationError('');
            }} placeholder="Phone number" placeholderTextColor="#7f8ca8" style={styles.input} keyboardType="phone-pad" />
            <TextInput value={applicantEmail} onChangeText={text => {
              setApplicantEmail(text);
              if (applicationError) setApplicationError('');
            }} placeholder="Email address" placeholderTextColor="#7f8ca8" style={styles.input} autoCapitalize="none" keyboardType="email-address" />
            <TextInput value={applicantCity} onChangeText={text => {
              setApplicantCity(text);
              if (applicationError) setApplicationError('');
            }} placeholder="City" placeholderTextColor="#7f8ca8" style={styles.input} />
            <TextInput value={applicantExperience} onChangeText={text => {
              setApplicantExperience(text);
              if (applicationError) setApplicationError('');
            }} placeholder="Driving experience, license class, availability" placeholderTextColor="#7f8ca8" style={[styles.input, styles.applicationNoteInput]} multiline textAlignVertical="top" />
            {applicationError ? <Text style={styles.errorText}>{applicationError}</Text> : null}
            {applicationStatus ? <Text style={styles.successText}>{applicationStatus}</Text> : null}
            <Pressable style={[styles.secondaryButton, (!canSubmitApplication || isSubmittingApplication) ? styles.primaryButtonDisabled : null]} onPress={() => void submitApplication()} disabled={!canSubmitApplication || isSubmittingApplication}>
              {isSubmittingApplication ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.secondaryButtonText}>Send Application</Text>}
            </Pressable>
          </View>
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
    paddingTop: 10,
    gap: 16,
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  card: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.sm,
    padding: 20,
    borderWidth: 1,
    borderColor: driverTheme.colors.border,
    gap: 14,
    width: '100%',
    alignSelf: 'center'
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
  secondaryButton: {
    backgroundColor: '#3263ff',
    borderRadius: driverTheme.radius.sm,
    paddingVertical: 15,
    alignItems: 'center'
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800'
  },
  applySection: {
    marginTop: 6,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: driverTheme.colors.border,
    gap: 10
  },
  applyEyebrow: {
    color: '#3263ff',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 11,
    fontWeight: '800'
  },
  applyTitle: {
    color: driverTheme.colors.text,
    fontSize: 20,
    fontWeight: '700'
  },
  applyText: {
    color: driverTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  applicationNoteInput: {
    minHeight: 92
  },
  errorText: {
    color: '#b03050'
  },
  successText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700'
  }
});