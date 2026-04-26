import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useState } from 'react';
import { DriverRuntime } from '../hooks/useDriverRuntime';
import { driverTheme } from '../components/driver/driverTheme';
import { DRIVER_APP_CONFIG } from '../config/driverAppConfig';

const isLocalPasswordlessDriverLoginEnabled = __DEV__;

type Props = {
  runtime: DriverRuntime;
};

const createInitialApplicationForm = () => ({
  firstName: '',
  middleName: '',
  lastName: '',
  phone: '',
  email: '',
  dateOfBirth: '',
  socialSecurityNumber: '',
  positionApplied: '',
  dateAvailable: '',
  legalRightToWork: '',
  currentStreet: '',
  currentCity: '',
  currentState: '',
  currentZip: '',
  currentYears: '',
  mailingStreet: '',
  mailingCity: '',
  mailingState: '',
  mailingZip: '',
  mailingYears: '',
  previousStreet1: '',
  previousCity1: '',
  previousState1: '',
  previousZip1: '',
  previousYears1: '',
  previousStreet2: '',
  previousCity2: '',
  previousState2: '',
  previousZip2: '',
  previousYears2: '',
  previousStreet3: '',
  previousCity3: '',
  previousState3: '',
  previousZip3: '',
  previousYears3: '',
  licenseState: '',
  licenseNumber: '',
  licenseTypeClass: '',
  licenseEndorsements: '',
  licenseExpirationDate: '',
  previousLicenseState1: '',
  previousLicenseNumber1: '',
  previousLicenseTypeClass1: '',
  previousLicenseEndorsements1: '',
  previousLicenseExpirationDate1: '',
  previousLicenseState2: '',
  previousLicenseNumber2: '',
  previousLicenseTypeClass2: '',
  previousLicenseEndorsements2: '',
  previousLicenseExpirationDate2: '',
  straightTruckType: '',
  straightTruckFrom: '',
  straightTruckTo: '',
  straightTruckMiles: '',
  tractorSemiType: '',
  tractorSemiFrom: '',
  tractorSemiTo: '',
  tractorSemiMiles: '',
  tractorTwoTrailersType: '',
  tractorTwoTrailersFrom: '',
  tractorTwoTrailersTo: '',
  tractorTwoTrailersMiles: '',
  tractorTankerType: '',
  tractorTankerFrom: '',
  tractorTankerTo: '',
  tractorTankerMiles: '',
  otherEquipmentType: '',
  otherEquipmentFrom: '',
  otherEquipmentTo: '',
  otherEquipmentMiles: '',
  accidentDate1: '',
  accidentNature1: '',
  accidentFatalities1: '',
  accidentInjuries1: '',
  accidentChemicalSpills1: '',
  accidentDate2: '',
  accidentNature2: '',
  accidentFatalities2: '',
  accidentInjuries2: '',
  accidentChemicalSpills2: '',
  accidentDate3: '',
  accidentNature3: '',
  accidentFatalities3: '',
  accidentInjuries3: '',
  accidentChemicalSpills3: '',
  convictionDate1: '',
  convictionViolation1: '',
  convictionState1: '',
  convictionPenalty1: '',
  convictionDate2: '',
  convictionViolation2: '',
  convictionState2: '',
  convictionPenalty2: '',
  convictionDate3: '',
  convictionViolation3: '',
  convictionState3: '',
  convictionPenalty3: '',
  deniedLicense: '',
  deniedLicenseExplanation: '',
  suspendedLicense: '',
  suspendedLicenseExplanation: '',
  currentEmployerName: '',
  currentEmployerPhone: '',
  currentEmployerAddress: '',
  currentEmployerPosition: '',
  currentEmployerFrom: '',
  currentEmployerTo: '',
  currentEmployerReason: '',
  currentEmployerSalary: '',
  currentEmployerGaps: '',
  currentEmployerFmcsa: '',
  currentEmployerSafetySensitive: '',
  secondEmployerName: '',
  secondEmployerPhone: '',
  secondEmployerAddress: '',
  secondEmployerPosition: '',
  secondEmployerFrom: '',
  secondEmployerTo: '',
  secondEmployerReason: '',
  secondEmployerSalary: '',
  secondEmployerGaps: '',
  secondEmployerFmcsa: '',
  secondEmployerSafetySensitive: '',
  thirdEmployerName: '',
  thirdEmployerPhone: '',
  thirdEmployerAddress: '',
  thirdEmployerPosition: '',
  thirdEmployerFrom: '',
  thirdEmployerTo: '',
  thirdEmployerReason: '',
  thirdEmployerSalary: '',
  thirdEmployerGaps: '',
  thirdEmployerFmcsa: '',
  thirdEmployerSafetySensitive: '',
  highSchoolName: '',
  highSchoolCourse: '',
  highSchoolYears: '',
  highSchoolGraduate: '',
  highSchoolDetails: '',
  collegeName: '',
  collegeCourse: '',
  collegeYears: '',
  collegeGraduate: '',
  collegeDetails: '',
  otherSchoolName: '',
  otherSchoolCourse: '',
  otherSchoolYears: '',
  otherSchoolGraduate: '',
  otherSchoolDetails: '',
  otherQualifications: '',
  applicantSignature: '',
  applicantPrintedName: ''
});

type ApplicationFormState = ReturnType<typeof createInitialApplicationForm>;
type ApplicationField = keyof ApplicationFormState;

const SectionTitle = ({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) => <View style={styles.sectionHeading}>
    <Text style={styles.applyEyebrow}>{eyebrow}</Text>
    <Text style={styles.sectionTitle}>{title}</Text>
    {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
  </View>;

const Field = ({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  multiline,
  minHeight
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  minHeight?: number;
}) => <View style={styles.fieldGroup}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder || label}
      placeholderTextColor="#7f8ca8"
      style={[styles.input, multiline ? styles.multilineInput : null, minHeight ? { minHeight } : null]}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize || 'sentences'}
      autoCorrect={false}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
    />
  </View>;

const YesNoField = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => <View style={styles.fieldGroup}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={styles.choiceRow}>
      <Pressable style={[styles.choiceButton, value === 'yes' ? styles.choiceButtonActive : null]} onPress={() => onChange(value === 'yes' ? '' : 'yes')}>
        <Text style={[styles.choiceButtonText, value === 'yes' ? styles.choiceButtonTextActive : null]}>Yes</Text>
      </Pressable>
      <Pressable style={[styles.choiceButton, value === 'no' ? styles.choiceButtonActive : null]} onPress={() => onChange(value === 'no' ? '' : 'no')}>
        <Text style={[styles.choiceButtonText, value === 'no' ? styles.choiceButtonTextActive : null]}>No</Text>
      </Pressable>
    </View>
  </View>;

const ExperienceRow = ({
  title,
  typeValue,
  fromValue,
  toValue,
  milesValue,
  onTypeChange,
  onFromChange,
  onToChange,
  onMilesChange,
  compact
}: {
  title: string;
  typeValue: string;
  fromValue: string;
  toValue: string;
  milesValue: string;
  onTypeChange: (text: string) => void;
  onFromChange: (text: string) => void;
  onToChange: (text: string) => void;
  onMilesChange: (text: string) => void;
  compact: boolean;
}) => <View style={styles.subsectionCard}>
    <Text style={styles.subsectionTitle}>{title}</Text>
    <Field label="Type of equipment" value={typeValue} onChangeText={onTypeChange} autoCapitalize="words" />
    <View style={[styles.fieldRow, compact ? styles.fieldRowCompact : null]}>
      <View style={styles.fieldCol}><Field label="Date from" value={fromValue} onChangeText={onFromChange} placeholder="MM/YYYY" /></View>
      <View style={styles.fieldCol}><Field label="Date to" value={toValue} onChangeText={onToChange} placeholder="MM/YYYY" /></View>
      <View style={styles.fieldCol}><Field label="Approx. miles" value={milesValue} onChangeText={onMilesChange} keyboardType="numeric" /></View>
    </View>
  </View>;

export const DriverLoginScreen = ({ runtime }: Props) => {
  const { width } = useWindowDimensions();
  const horizontalPadding = width < 380 ? 16 : 20;
  const cardMaxWidth = Math.min(760, Math.max(320, width - horizontalPadding * 2));
  const logoWidth = Math.min(width - horizontalPadding * 2, 320);
  const isCompact = width < 560;
  const [applicationForm, setApplicationForm] = useState<ApplicationFormState>(createInitialApplicationForm);
  const [applicationStatus, setApplicationStatus] = useState('');
  const [applicationError, setApplicationError] = useState('');
  const [isSubmittingApplication, setIsSubmittingApplication] = useState(false);
  const [showApplicationForm, setShowApplicationForm] = useState(false);

  const updateField = (field: ApplicationField, value: string) => {
    setApplicationForm(current => ({ ...current, [field]: value }));
    if (applicationError) setApplicationError('');
  };

  const submitApplication = async () => {
    if (isSubmittingApplication) return;
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
          application: applicationForm
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Unable to submit application right now.');
      }
      setApplicationStatus('Application sent. Dispatch Leadership can review the full form on the web Applications page now. Blank sections are allowed and were kept as submitted.');
      setShowApplicationForm(true);
      setApplicationForm(createInitialApplicationForm());
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

          <Pressable style={styles.applicationToggleButton} onPress={() => setShowApplicationForm(current => !current)}>
            <Text style={styles.applicationToggleButtonText}>{showApplicationForm ? 'Hide Application Form' : 'Applications'}</Text>
          </Pressable>

          {showApplicationForm ? <View style={styles.applySection}>
            <SectionTitle eyebrow="Apply Here" title="Driver employment application" description="This follows the long paper application format. Fill as much as you want and send it directly from the app." />

            <SectionTitle eyebrow="Section 1" title="Applicant Information" />
            <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
              <View style={styles.fieldCol}><Field label="First name" value={applicationForm.firstName} onChangeText={text => updateField('firstName', text)} autoCapitalize="words" /></View>
              <View style={styles.fieldCol}><Field label="Middle name" value={applicationForm.middleName} onChangeText={text => updateField('middleName', text)} autoCapitalize="words" /></View>
              <View style={styles.fieldCol}><Field label="Last name" value={applicationForm.lastName} onChangeText={text => updateField('lastName', text)} autoCapitalize="words" /></View>
            </View>
            <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
              <View style={styles.fieldCol}><Field label="Phone" value={applicationForm.phone} onChangeText={text => updateField('phone', text)} keyboardType="phone-pad" autoCapitalize="none" /></View>
              <View style={styles.fieldCol}><Field label="Email" value={applicationForm.email} onChangeText={text => updateField('email', text)} keyboardType="email-address" autoCapitalize="none" /></View>
            </View>
            <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
              <View style={styles.fieldCol}><Field label="Date of birth" value={applicationForm.dateOfBirth} onChangeText={text => updateField('dateOfBirth', text)} placeholder="MM/DD/YYYY" /></View>
              <View style={styles.fieldCol}><Field label="Social Security #" value={applicationForm.socialSecurityNumber} onChangeText={text => updateField('socialSecurityNumber', text)} autoCapitalize="none" /></View>
            </View>
            <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
              <View style={styles.fieldCol}><Field label="Position applied for" value={applicationForm.positionApplied} onChangeText={text => updateField('positionApplied', text)} autoCapitalize="words" /></View>
              <View style={styles.fieldCol}><Field label="Date available for work" value={applicationForm.dateAvailable} onChangeText={text => updateField('dateAvailable', text)} placeholder="MM/DD/YYYY" /></View>
            </View>
            <YesNoField label="Do you have legal right to work in the United States?" value={applicationForm.legalRightToWork} onChange={value => updateField('legalRightToWork', value)} />

            <SectionTitle eyebrow="Section 2" title="Previous Three Years Residency" description="Use each row if you want to include current, mailing, and previous addresses." />
            <View style={styles.subsectionCard}>
              <Text style={styles.subsectionTitle}>Current address</Text>
              <Field label="Street" value={applicationForm.currentStreet} onChangeText={text => updateField('currentStreet', text)} />
              <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
                <View style={styles.fieldCol}><Field label="City" value={applicationForm.currentCity} onChangeText={text => updateField('currentCity', text)} autoCapitalize="words" /></View>
                <View style={styles.fieldCol}><Field label="State" value={applicationForm.currentState} onChangeText={text => updateField('currentState', text)} autoCapitalize="characters" /></View>
                <View style={styles.fieldCol}><Field label="Zip code" value={applicationForm.currentZip} onChangeText={text => updateField('currentZip', text)} keyboardType="numeric" /></View>
                <View style={styles.fieldCol}><Field label="# of years" value={applicationForm.currentYears} onChangeText={text => updateField('currentYears', text)} /></View>
              </View>
            </View>
            <View style={styles.subsectionCard}>
              <Text style={styles.subsectionTitle}>Mailing address</Text>
              <Field label="Street" value={applicationForm.mailingStreet} onChangeText={text => updateField('mailingStreet', text)} />
              <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
                <View style={styles.fieldCol}><Field label="City" value={applicationForm.mailingCity} onChangeText={text => updateField('mailingCity', text)} autoCapitalize="words" /></View>
                <View style={styles.fieldCol}><Field label="State" value={applicationForm.mailingState} onChangeText={text => updateField('mailingState', text)} autoCapitalize="characters" /></View>
                <View style={styles.fieldCol}><Field label="Zip code" value={applicationForm.mailingZip} onChangeText={text => updateField('mailingZip', text)} keyboardType="numeric" /></View>
                <View style={styles.fieldCol}><Field label="# of years" value={applicationForm.mailingYears} onChangeText={text => updateField('mailingYears', text)} /></View>
              </View>
            </View>
            {[
              ['previousStreet1', 'previousCity1', 'previousState1', 'previousZip1', 'previousYears1', 'Previous address 1'],
              ['previousStreet2', 'previousCity2', 'previousState2', 'previousZip2', 'previousYears2', 'Previous address 2'],
              ['previousStreet3', 'previousCity3', 'previousState3', 'previousZip3', 'previousYears3', 'Previous address 3']
            ].map(([streetField, cityField, stateField, zipField, yearsField, title]) => <View style={styles.subsectionCard} key={title}>
                <Text style={styles.subsectionTitle}>{title}</Text>
                <Field label="Street" value={applicationForm[streetField as ApplicationField]} onChangeText={text => updateField(streetField as ApplicationField, text)} />
                <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
                  <View style={styles.fieldCol}><Field label="City" value={applicationForm[cityField as ApplicationField]} onChangeText={text => updateField(cityField as ApplicationField, text)} autoCapitalize="words" /></View>
                  <View style={styles.fieldCol}><Field label="State" value={applicationForm[stateField as ApplicationField]} onChangeText={text => updateField(stateField as ApplicationField, text)} autoCapitalize="characters" /></View>
                  <View style={styles.fieldCol}><Field label="Zip code" value={applicationForm[zipField as ApplicationField]} onChangeText={text => updateField(zipField as ApplicationField, text)} keyboardType="numeric" /></View>
                  <View style={styles.fieldCol}><Field label="# of years" value={applicationForm[yearsField as ApplicationField]} onChangeText={text => updateField(yearsField as ApplicationField, text)} /></View>
                </View>
              </View>)}

            <SectionTitle eyebrow="Section 3" title="License Information" description="Include current license and previously held licenses if you have them." />
            <View style={styles.subsectionCard}>
              <Text style={styles.subsectionTitle}>Current license</Text>
              <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
                <View style={styles.fieldCol}><Field label="State" value={applicationForm.licenseState} onChangeText={text => updateField('licenseState', text)} autoCapitalize="characters" /></View>
                <View style={styles.fieldCol}><Field label="License #" value={applicationForm.licenseNumber} onChangeText={text => updateField('licenseNumber', text)} autoCapitalize="characters" /></View>
              </View>
              <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
                <View style={styles.fieldCol}><Field label="Type / class" value={applicationForm.licenseTypeClass} onChangeText={text => updateField('licenseTypeClass', text)} autoCapitalize="characters" /></View>
                <View style={styles.fieldCol}><Field label="Endorsements" value={applicationForm.licenseEndorsements} onChangeText={text => updateField('licenseEndorsements', text)} autoCapitalize="characters" /></View>
                <View style={styles.fieldCol}><Field label="Expiration date" value={applicationForm.licenseExpirationDate} onChangeText={text => updateField('licenseExpirationDate', text)} placeholder="MM/DD/YYYY" /></View>
              </View>
            </View>
            {[
              ['previousLicenseState1', 'previousLicenseNumber1', 'previousLicenseTypeClass1', 'previousLicenseEndorsements1', 'previousLicenseExpirationDate1', 'Previously held license 1'],
              ['previousLicenseState2', 'previousLicenseNumber2', 'previousLicenseTypeClass2', 'previousLicenseEndorsements2', 'previousLicenseExpirationDate2', 'Previously held license 2']
            ].map(([stateField, numberField, typeField, endorsementField, expirationField, title]) => <View style={styles.subsectionCard} key={title}>
                <Text style={styles.subsectionTitle}>{title}</Text>
                <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
                  <View style={styles.fieldCol}><Field label="State" value={applicationForm[stateField as ApplicationField]} onChangeText={text => updateField(stateField as ApplicationField, text)} autoCapitalize="characters" /></View>
                  <View style={styles.fieldCol}><Field label="License #" value={applicationForm[numberField as ApplicationField]} onChangeText={text => updateField(numberField as ApplicationField, text)} autoCapitalize="characters" /></View>
                </View>
                <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
                  <View style={styles.fieldCol}><Field label="Type / class" value={applicationForm[typeField as ApplicationField]} onChangeText={text => updateField(typeField as ApplicationField, text)} autoCapitalize="characters" /></View>
                  <View style={styles.fieldCol}><Field label="Endorsements" value={applicationForm[endorsementField as ApplicationField]} onChangeText={text => updateField(endorsementField as ApplicationField, text)} autoCapitalize="characters" /></View>
                  <View style={styles.fieldCol}><Field label="Expiration date" value={applicationForm[expirationField as ApplicationField]} onChangeText={text => updateField(expirationField as ApplicationField, text)} placeholder="MM/DD/YYYY" /></View>
                </View>
              </View>)}

            <SectionTitle eyebrow="Section 4" title="Driving Experience" />
            <ExperienceRow title="Straight truck" typeValue={applicationForm.straightTruckType} fromValue={applicationForm.straightTruckFrom} toValue={applicationForm.straightTruckTo} milesValue={applicationForm.straightTruckMiles} onTypeChange={text => updateField('straightTruckType', text)} onFromChange={text => updateField('straightTruckFrom', text)} onToChange={text => updateField('straightTruckTo', text)} onMilesChange={text => updateField('straightTruckMiles', text)} compact={isCompact} />
            <ExperienceRow title="Tractor and semi-trailer" typeValue={applicationForm.tractorSemiType} fromValue={applicationForm.tractorSemiFrom} toValue={applicationForm.tractorSemiTo} milesValue={applicationForm.tractorSemiMiles} onTypeChange={text => updateField('tractorSemiType', text)} onFromChange={text => updateField('tractorSemiFrom', text)} onToChange={text => updateField('tractorSemiTo', text)} onMilesChange={text => updateField('tractorSemiMiles', text)} compact={isCompact} />
            <ExperienceRow title="Tractor and 2 trailers" typeValue={applicationForm.tractorTwoTrailersType} fromValue={applicationForm.tractorTwoTrailersFrom} toValue={applicationForm.tractorTwoTrailersTo} milesValue={applicationForm.tractorTwoTrailersMiles} onTypeChange={text => updateField('tractorTwoTrailersType', text)} onFromChange={text => updateField('tractorTwoTrailersFrom', text)} onToChange={text => updateField('tractorTwoTrailersTo', text)} onMilesChange={text => updateField('tractorTwoTrailersMiles', text)} compact={isCompact} />
            <ExperienceRow title="Tractor and tanker" typeValue={applicationForm.tractorTankerType} fromValue={applicationForm.tractorTankerFrom} toValue={applicationForm.tractorTankerTo} milesValue={applicationForm.tractorTankerMiles} onTypeChange={text => updateField('tractorTankerType', text)} onFromChange={text => updateField('tractorTankerFrom', text)} onToChange={text => updateField('tractorTankerTo', text)} onMilesChange={text => updateField('tractorTankerMiles', text)} compact={isCompact} />
            <ExperienceRow title="Other" typeValue={applicationForm.otherEquipmentType} fromValue={applicationForm.otherEquipmentFrom} toValue={applicationForm.otherEquipmentTo} milesValue={applicationForm.otherEquipmentMiles} onTypeChange={text => updateField('otherEquipmentType', text)} onFromChange={text => updateField('otherEquipmentFrom', text)} onToChange={text => updateField('otherEquipmentTo', text)} onMilesChange={text => updateField('otherEquipmentMiles', text)} compact={isCompact} />

            <SectionTitle eyebrow="Section 5" title="Accident Record For The Past 3 Years" />
            {[1, 2, 3].map(index => <View style={styles.subsectionCard} key={`accident-${index}`}>
                <Text style={styles.subsectionTitle}>{`Accident ${index}`}</Text>
                <Field label="Date" value={applicationForm[`accidentDate${index}` as ApplicationField]} onChangeText={text => updateField(`accidentDate${index}` as ApplicationField, text)} placeholder="MM/YYYY" />
                <Field label="Nature of accident" value={applicationForm[`accidentNature${index}` as ApplicationField]} onChangeText={text => updateField(`accidentNature${index}` as ApplicationField, text)} multiline minHeight={74} />
                <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
                  <View style={styles.fieldCol}><Field label="# fatalities" value={applicationForm[`accidentFatalities${index}` as ApplicationField]} onChangeText={text => updateField(`accidentFatalities${index}` as ApplicationField, text)} keyboardType="numeric" /></View>
                  <View style={styles.fieldCol}><Field label="# injuries" value={applicationForm[`accidentInjuries${index}` as ApplicationField]} onChangeText={text => updateField(`accidentInjuries${index}` as ApplicationField, text)} keyboardType="numeric" /></View>
                  <View style={styles.fieldCol}><Field label="Chemical spills (Y/N)" value={applicationForm[`accidentChemicalSpills${index}` as ApplicationField]} onChangeText={text => updateField(`accidentChemicalSpills${index}` as ApplicationField, text)} autoCapitalize="characters" /></View>
                </View>
              </View>)}

            <SectionTitle eyebrow="Section 6" title="Traffic Convictions And Forfeitures" />
            {[1, 2, 3].map(index => <View style={styles.subsectionCard} key={`conviction-${index}`}>
                <Text style={styles.subsectionTitle}>{`Conviction ${index}`}</Text>
                <Field label="Date convicted" value={applicationForm[`convictionDate${index}` as ApplicationField]} onChangeText={text => updateField(`convictionDate${index}` as ApplicationField, text)} placeholder="MM/YYYY" />
                <Field label="Violation" value={applicationForm[`convictionViolation${index}` as ApplicationField]} onChangeText={text => updateField(`convictionViolation${index}` as ApplicationField, text)} multiline minHeight={74} />
                <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
                  <View style={styles.fieldCol}><Field label="State" value={applicationForm[`convictionState${index}` as ApplicationField]} onChangeText={text => updateField(`convictionState${index}` as ApplicationField, text)} autoCapitalize="characters" /></View>
                  <View style={styles.fieldCol}><Field label="Penalty" value={applicationForm[`convictionPenalty${index}` as ApplicationField]} onChangeText={text => updateField(`convictionPenalty${index}` as ApplicationField, text)} multiline minHeight={74} /></View>
                </View>
              </View>)}

            <SectionTitle eyebrow="Section 7" title="License Questions" />
            <YesNoField label="Have you ever been denied a license, permit, or privilege to operate a motor vehicle?" value={applicationForm.deniedLicense} onChange={value => updateField('deniedLicense', value)} />
            <Field label="If yes, explain" value={applicationForm.deniedLicenseExplanation} onChangeText={text => updateField('deniedLicenseExplanation', text)} multiline minHeight={74} />
            <YesNoField label="Has any license, permit, or privilege ever been suspended or revoked?" value={applicationForm.suspendedLicense} onChange={value => updateField('suspendedLicense', value)} />
            <Field label="If yes, explain" value={applicationForm.suspendedLicenseExplanation} onChangeText={text => updateField('suspendedLicenseExplanation', text)} multiline minHeight={74} />

            <SectionTitle eyebrow="Section 8" title="Employment History" description="List current or most recent employers first. All fields remain optional so partial submissions are still accepted." />
            {[
              ['currentEmployer', 'Current (most recent) employer'],
              ['secondEmployer', 'Second employer'],
              ['thirdEmployer', 'Third employer']
            ].map(([prefix, title]) => <View style={styles.subsectionCard} key={prefix}>
                <Text style={styles.subsectionTitle}>{title}</Text>
                <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
                  <View style={styles.fieldCol}><Field label="Name" value={applicationForm[`${prefix}Name` as ApplicationField]} onChangeText={text => updateField(`${prefix}Name` as ApplicationField, text)} autoCapitalize="words" /></View>
                  <View style={styles.fieldCol}><Field label="Phone" value={applicationForm[`${prefix}Phone` as ApplicationField]} onChangeText={text => updateField(`${prefix}Phone` as ApplicationField, text)} keyboardType="phone-pad" autoCapitalize="none" /></View>
                </View>
                <Field label="Address" value={applicationForm[`${prefix}Address` as ApplicationField]} onChangeText={text => updateField(`${prefix}Address` as ApplicationField, text)} multiline minHeight={74} />
                <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
                  <View style={styles.fieldCol}><Field label="Position held" value={applicationForm[`${prefix}Position` as ApplicationField]} onChangeText={text => updateField(`${prefix}Position` as ApplicationField, text)} /></View>
                  <View style={styles.fieldCol}><Field label="From" value={applicationForm[`${prefix}From` as ApplicationField]} onChangeText={text => updateField(`${prefix}From` as ApplicationField, text)} placeholder="MM/YYYY" /></View>
                  <View style={styles.fieldCol}><Field label="To" value={applicationForm[`${prefix}To` as ApplicationField]} onChangeText={text => updateField(`${prefix}To` as ApplicationField, text)} placeholder="MM/YYYY" /></View>
                </View>
                <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
                  <View style={styles.fieldCol}><Field label="Reason for leaving" value={applicationForm[`${prefix}Reason` as ApplicationField]} onChangeText={text => updateField(`${prefix}Reason` as ApplicationField, text)} /></View>
                  <View style={styles.fieldCol}><Field label="Salary" value={applicationForm[`${prefix}Salary` as ApplicationField]} onChangeText={text => updateField(`${prefix}Salary` as ApplicationField, text)} /></View>
                </View>
                <Field label="Explain any gaps in employment" value={applicationForm[`${prefix}Gaps` as ApplicationField]} onChangeText={text => updateField(`${prefix}Gaps` as ApplicationField, text)} multiline minHeight={74} />
                <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
                  <View style={styles.fieldCol}><YesNoField label="Subject to FMCSR while employed here?" value={applicationForm[`${prefix}Fmcsa` as ApplicationField]} onChange={value => updateField(`${prefix}Fmcsa` as ApplicationField, value)} /></View>
                  <View style={styles.fieldCol}><YesNoField label="Safety-sensitive DOT role?" value={applicationForm[`${prefix}SafetySensitive` as ApplicationField]} onChange={value => updateField(`${prefix}SafetySensitive` as ApplicationField, value)} /></View>
                </View>
              </View>)}

            <SectionTitle eyebrow="Section 9" title="Education" />
            {[
              ['highSchool', 'High school'],
              ['college', 'College'],
              ['otherSchool', 'Other']
            ].map(([prefix, title]) => <View style={styles.subsectionCard} key={prefix}>
                <Text style={styles.subsectionTitle}>{title}</Text>
                <Field label="Name and location" value={applicationForm[`${prefix}Name` as ApplicationField]} onChangeText={text => updateField(`${prefix}Name` as ApplicationField, text)} />
                <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
                  <View style={styles.fieldCol}><Field label="Course of study" value={applicationForm[`${prefix}Course` as ApplicationField]} onChangeText={text => updateField(`${prefix}Course` as ApplicationField, text)} /></View>
                  <View style={styles.fieldCol}><Field label="Years completed" value={applicationForm[`${prefix}Years` as ApplicationField]} onChangeText={text => updateField(`${prefix}Years` as ApplicationField, text)} /></View>
                </View>
                <YesNoField label="Graduate?" value={applicationForm[`${prefix}Graduate` as ApplicationField]} onChange={value => updateField(`${prefix}Graduate` as ApplicationField, value)} />
                <Field label="Details" value={applicationForm[`${prefix}Details` as ApplicationField]} onChangeText={text => updateField(`${prefix}Details` as ApplicationField, text)} multiline minHeight={74} />
              </View>)}

            <SectionTitle eyebrow="Section 10" title="Other Qualifications" />
            <Field label="Please list any other qualifications that should be considered" value={applicationForm.otherQualifications} onChangeText={text => updateField('otherQualifications', text)} multiline minHeight={120} />

            <SectionTitle eyebrow="Section 11" title="Applicant Signature" description="This digital section lets the applicant type their name if they want to sign before sending." />
            <View style={[styles.fieldRow, isCompact ? styles.fieldRowCompact : null]}>
              <View style={styles.fieldCol}><Field label="Applicant signature" value={applicationForm.applicantSignature} onChangeText={text => updateField('applicantSignature', text)} autoCapitalize="words" /></View>
              <View style={styles.fieldCol}><Field label="Applicant name (printed)" value={applicationForm.applicantPrintedName} onChangeText={text => updateField('applicantPrintedName', text)} autoCapitalize="words" /></View>
            </View>

            {applicationError ? <Text style={styles.errorText}>{applicationError}</Text> : null}
            {applicationStatus ? <Text style={styles.successText}>{applicationStatus}</Text> : null}
            <Pressable style={[styles.secondaryButton, isSubmittingApplication ? styles.primaryButtonDisabled : null]} onPress={() => void submitApplication()} disabled={isSubmittingApplication}>
              {isSubmittingApplication ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.secondaryButtonText}>Send Full Application</Text>}
            </Pressable>
          </View> : null}
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
    alignItems: 'center',
    paddingBottom: 28
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
  multilineInput: {
    minHeight: 96
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
  applicationToggleButton: {
    backgroundColor: '#e8eefc',
    borderRadius: driverTheme.radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#c7d4ff'
  },
  applicationToggleButtonText: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '800'
  },
  applicationHelperText: {
    color: driverTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18
  },
  applySection: {
    marginTop: 6,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: driverTheme.colors.border,
    gap: 14
  },
  sectionHeading: {
    gap: 4
  },
  sectionTitle: {
    color: driverTheme.colors.text,
    fontSize: 20,
    fontWeight: '700'
  },
  sectionDescription: {
    color: driverTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  applyEyebrow: {
    color: '#3263ff',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 11,
    fontWeight: '800'
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12
  },
  fieldRowCompact: {
    flexDirection: 'column'
  },
  fieldCol: {
    flex: 1
  },
  fieldGroup: {
    gap: 6,
    flex: 1
  },
  fieldLabel: {
    color: driverTheme.colors.primaryText,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4
  },
  subsectionCard: {
    gap: 10,
    borderWidth: 1,
    borderColor: '#d8e1f5',
    borderRadius: driverTheme.radius.sm,
    padding: 14,
    backgroundColor: '#f8fbff'
  },
  subsectionTitle: {
    color: driverTheme.colors.text,
    fontSize: 15,
    fontWeight: '800'
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 10
  },
  choiceButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#c7d4ff',
    borderRadius: driverTheme.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#ffffff'
  },
  choiceButtonActive: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8'
  },
  choiceButtonText: {
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '700'
  },
  choiceButtonTextActive: {
    color: '#ffffff'
  },
  errorText: {
    color: '#b03050'
  },
  successText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18
  }
});