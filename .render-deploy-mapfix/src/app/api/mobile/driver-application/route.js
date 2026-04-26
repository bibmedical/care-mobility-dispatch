import { buildMobileCorsPreflightResponse, jsonWithMobileCors } from '@/server/mobile-api-cors';
import { upsertSystemMessage } from '@/server/system-messages-store';

const normalizeField = value => String(value || '').trim();
const normalizeYesNo = value => {
  const normalized = normalizeField(value).toLowerCase();
  if (normalized === 'yes' || normalized === 'no') return normalized;
  return '';
};

const normalizeForm = source => ({
  firstName: normalizeField(source?.firstName),
  middleName: normalizeField(source?.middleName),
  lastName: normalizeField(source?.lastName),
  phone: normalizeField(source?.phone),
  email: normalizeField(source?.email).toLowerCase(),
  dateOfBirth: normalizeField(source?.dateOfBirth),
  socialSecurityNumber: normalizeField(source?.socialSecurityNumber),
  positionApplied: normalizeField(source?.positionApplied),
  dateAvailable: normalizeField(source?.dateAvailable),
  legalRightToWork: normalizeYesNo(source?.legalRightToWork),
  currentStreet: normalizeField(source?.currentStreet),
  currentCity: normalizeField(source?.currentCity),
  currentState: normalizeField(source?.currentState),
  currentZip: normalizeField(source?.currentZip),
  currentYears: normalizeField(source?.currentYears),
  mailingStreet: normalizeField(source?.mailingStreet),
  mailingCity: normalizeField(source?.mailingCity),
  mailingState: normalizeField(source?.mailingState),
  mailingZip: normalizeField(source?.mailingZip),
  mailingYears: normalizeField(source?.mailingYears),
  previousStreet1: normalizeField(source?.previousStreet1),
  previousCity1: normalizeField(source?.previousCity1),
  previousState1: normalizeField(source?.previousState1),
  previousZip1: normalizeField(source?.previousZip1),
  previousYears1: normalizeField(source?.previousYears1),
  previousStreet2: normalizeField(source?.previousStreet2),
  previousCity2: normalizeField(source?.previousCity2),
  previousState2: normalizeField(source?.previousState2),
  previousZip2: normalizeField(source?.previousZip2),
  previousYears2: normalizeField(source?.previousYears2),
  previousStreet3: normalizeField(source?.previousStreet3),
  previousCity3: normalizeField(source?.previousCity3),
  previousState3: normalizeField(source?.previousState3),
  previousZip3: normalizeField(source?.previousZip3),
  previousYears3: normalizeField(source?.previousYears3),
  licenseState: normalizeField(source?.licenseState),
  licenseNumber: normalizeField(source?.licenseNumber),
  licenseTypeClass: normalizeField(source?.licenseTypeClass),
  licenseEndorsements: normalizeField(source?.licenseEndorsements),
  licenseExpirationDate: normalizeField(source?.licenseExpirationDate),
  previousLicenseState1: normalizeField(source?.previousLicenseState1),
  previousLicenseNumber1: normalizeField(source?.previousLicenseNumber1),
  previousLicenseTypeClass1: normalizeField(source?.previousLicenseTypeClass1),
  previousLicenseEndorsements1: normalizeField(source?.previousLicenseEndorsements1),
  previousLicenseExpirationDate1: normalizeField(source?.previousLicenseExpirationDate1),
  previousLicenseState2: normalizeField(source?.previousLicenseState2),
  previousLicenseNumber2: normalizeField(source?.previousLicenseNumber2),
  previousLicenseTypeClass2: normalizeField(source?.previousLicenseTypeClass2),
  previousLicenseEndorsements2: normalizeField(source?.previousLicenseEndorsements2),
  previousLicenseExpirationDate2: normalizeField(source?.previousLicenseExpirationDate2),
  straightTruckType: normalizeField(source?.straightTruckType),
  straightTruckFrom: normalizeField(source?.straightTruckFrom),
  straightTruckTo: normalizeField(source?.straightTruckTo),
  straightTruckMiles: normalizeField(source?.straightTruckMiles),
  tractorSemiType: normalizeField(source?.tractorSemiType),
  tractorSemiFrom: normalizeField(source?.tractorSemiFrom),
  tractorSemiTo: normalizeField(source?.tractorSemiTo),
  tractorSemiMiles: normalizeField(source?.tractorSemiMiles),
  tractorTwoTrailersType: normalizeField(source?.tractorTwoTrailersType),
  tractorTwoTrailersFrom: normalizeField(source?.tractorTwoTrailersFrom),
  tractorTwoTrailersTo: normalizeField(source?.tractorTwoTrailersTo),
  tractorTwoTrailersMiles: normalizeField(source?.tractorTwoTrailersMiles),
  tractorTankerType: normalizeField(source?.tractorTankerType),
  tractorTankerFrom: normalizeField(source?.tractorTankerFrom),
  tractorTankerTo: normalizeField(source?.tractorTankerTo),
  tractorTankerMiles: normalizeField(source?.tractorTankerMiles),
  otherEquipmentType: normalizeField(source?.otherEquipmentType),
  otherEquipmentFrom: normalizeField(source?.otherEquipmentFrom),
  otherEquipmentTo: normalizeField(source?.otherEquipmentTo),
  otherEquipmentMiles: normalizeField(source?.otherEquipmentMiles),
  accidentDate1: normalizeField(source?.accidentDate1),
  accidentNature1: normalizeField(source?.accidentNature1),
  accidentFatalities1: normalizeField(source?.accidentFatalities1),
  accidentInjuries1: normalizeField(source?.accidentInjuries1),
  accidentChemicalSpills1: normalizeField(source?.accidentChemicalSpills1),
  accidentDate2: normalizeField(source?.accidentDate2),
  accidentNature2: normalizeField(source?.accidentNature2),
  accidentFatalities2: normalizeField(source?.accidentFatalities2),
  accidentInjuries2: normalizeField(source?.accidentInjuries2),
  accidentChemicalSpills2: normalizeField(source?.accidentChemicalSpills2),
  accidentDate3: normalizeField(source?.accidentDate3),
  accidentNature3: normalizeField(source?.accidentNature3),
  accidentFatalities3: normalizeField(source?.accidentFatalities3),
  accidentInjuries3: normalizeField(source?.accidentInjuries3),
  accidentChemicalSpills3: normalizeField(source?.accidentChemicalSpills3),
  convictionDate1: normalizeField(source?.convictionDate1),
  convictionViolation1: normalizeField(source?.convictionViolation1),
  convictionState1: normalizeField(source?.convictionState1),
  convictionPenalty1: normalizeField(source?.convictionPenalty1),
  convictionDate2: normalizeField(source?.convictionDate2),
  convictionViolation2: normalizeField(source?.convictionViolation2),
  convictionState2: normalizeField(source?.convictionState2),
  convictionPenalty2: normalizeField(source?.convictionPenalty2),
  convictionDate3: normalizeField(source?.convictionDate3),
  convictionViolation3: normalizeField(source?.convictionViolation3),
  convictionState3: normalizeField(source?.convictionState3),
  convictionPenalty3: normalizeField(source?.convictionPenalty3),
  deniedLicense: normalizeYesNo(source?.deniedLicense),
  deniedLicenseExplanation: normalizeField(source?.deniedLicenseExplanation),
  suspendedLicense: normalizeYesNo(source?.suspendedLicense),
  suspendedLicenseExplanation: normalizeField(source?.suspendedLicenseExplanation),
  currentEmployerName: normalizeField(source?.currentEmployerName),
  currentEmployerPhone: normalizeField(source?.currentEmployerPhone),
  currentEmployerAddress: normalizeField(source?.currentEmployerAddress),
  currentEmployerPosition: normalizeField(source?.currentEmployerPosition),
  currentEmployerFrom: normalizeField(source?.currentEmployerFrom),
  currentEmployerTo: normalizeField(source?.currentEmployerTo),
  currentEmployerReason: normalizeField(source?.currentEmployerReason),
  currentEmployerSalary: normalizeField(source?.currentEmployerSalary),
  currentEmployerGaps: normalizeField(source?.currentEmployerGaps),
  currentEmployerFmcsa: normalizeYesNo(source?.currentEmployerFmcsa),
  currentEmployerSafetySensitive: normalizeYesNo(source?.currentEmployerSafetySensitive),
  secondEmployerName: normalizeField(source?.secondEmployerName),
  secondEmployerPhone: normalizeField(source?.secondEmployerPhone),
  secondEmployerAddress: normalizeField(source?.secondEmployerAddress),
  secondEmployerPosition: normalizeField(source?.secondEmployerPosition),
  secondEmployerFrom: normalizeField(source?.secondEmployerFrom),
  secondEmployerTo: normalizeField(source?.secondEmployerTo),
  secondEmployerReason: normalizeField(source?.secondEmployerReason),
  secondEmployerSalary: normalizeField(source?.secondEmployerSalary),
  secondEmployerGaps: normalizeField(source?.secondEmployerGaps),
  secondEmployerFmcsa: normalizeYesNo(source?.secondEmployerFmcsa),
  secondEmployerSafetySensitive: normalizeYesNo(source?.secondEmployerSafetySensitive),
  thirdEmployerName: normalizeField(source?.thirdEmployerName),
  thirdEmployerPhone: normalizeField(source?.thirdEmployerPhone),
  thirdEmployerAddress: normalizeField(source?.thirdEmployerAddress),
  thirdEmployerPosition: normalizeField(source?.thirdEmployerPosition),
  thirdEmployerFrom: normalizeField(source?.thirdEmployerFrom),
  thirdEmployerTo: normalizeField(source?.thirdEmployerTo),
  thirdEmployerReason: normalizeField(source?.thirdEmployerReason),
  thirdEmployerSalary: normalizeField(source?.thirdEmployerSalary),
  thirdEmployerGaps: normalizeField(source?.thirdEmployerGaps),
  thirdEmployerFmcsa: normalizeYesNo(source?.thirdEmployerFmcsa),
  thirdEmployerSafetySensitive: normalizeYesNo(source?.thirdEmployerSafetySensitive),
  highSchoolName: normalizeField(source?.highSchoolName),
  highSchoolCourse: normalizeField(source?.highSchoolCourse),
  highSchoolYears: normalizeField(source?.highSchoolYears),
  highSchoolGraduate: normalizeYesNo(source?.highSchoolGraduate),
  highSchoolDetails: normalizeField(source?.highSchoolDetails),
  collegeName: normalizeField(source?.collegeName),
  collegeCourse: normalizeField(source?.collegeCourse),
  collegeYears: normalizeField(source?.collegeYears),
  collegeGraduate: normalizeYesNo(source?.collegeGraduate),
  collegeDetails: normalizeField(source?.collegeDetails),
  otherSchoolName: normalizeField(source?.otherSchoolName),
  otherSchoolCourse: normalizeField(source?.otherSchoolCourse),
  otherSchoolYears: normalizeField(source?.otherSchoolYears),
  otherSchoolGraduate: normalizeYesNo(source?.otherSchoolGraduate),
  otherSchoolDetails: normalizeField(source?.otherSchoolDetails),
  otherQualifications: normalizeField(source?.otherQualifications),
  applicantSignature: normalizeField(source?.applicantSignature),
  applicantPrintedName: normalizeField(source?.applicantPrintedName)
});

const buildApplicantName = form => [form.firstName, form.middleName, form.lastName].filter(Boolean).join(' ').trim();

const buildBodySummary = form => {
  const lines = [
    buildApplicantName(form) ? `Applicant: ${buildApplicantName(form)}` : '',
    form.positionApplied ? `Position: ${form.positionApplied}` : '',
    form.phone ? `Phone: ${form.phone}` : '',
    form.email ? `Email: ${form.email}` : '',
    form.currentCity ? `City: ${form.currentCity}` : '',
    form.licenseTypeClass ? `License class: ${form.licenseTypeClass}` : '',
    form.dateAvailable ? `Available: ${form.dateAvailable}` : ''
  ].filter(Boolean);

  return lines.length > 0 ? `${lines.join('. ')}.` : 'Driver application submitted from the app login screen with blank or partial fields.';
};

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonWithMobileCors(request, { ok: false, error: 'Invalid request body.' }, { status: 400 });
  }

  const rawForm = payload?.application && typeof payload.application === 'object' ? payload.application : payload;
  const form = normalizeForm(rawForm);
  const applicantName = buildApplicantName(form) || normalizeField(payload?.fullName) || 'Unnamed applicant';
  const phone = form.phone || normalizeField(payload?.phone);
  const email = form.email || normalizeField(payload?.email).toLowerCase();
  const city = form.currentCity || normalizeField(payload?.city);
  const licenseClass = form.licenseTypeClass || normalizeField(payload?.licenseClass);
  const experience = [form.straightTruckType, form.tractorSemiType, form.tractorTwoTrailersType, form.tractorTankerType, form.otherEquipmentType].filter(Boolean).join(', ') || normalizeField(payload?.experience);
  const availability = form.dateAvailable || normalizeField(payload?.availability);
  const vehicle = normalizeField(payload?.vehicle);
  const notes = [form.otherQualifications, normalizeField(payload?.notes)].filter(Boolean).join(' | ');

  const createdAt = new Date().toISOString();
  const applicationId = `driver-application-${Date.now()}`;

  await upsertSystemMessage({
    id: applicationId,
    type: 'driver-application',
    priority: 'high',
    audience: 'Dispatch Leadership',
    subject: `New driver application from ${applicantName}`,
    body: buildBodySummary(form),
    status: 'active',
    createdAt,
    source: 'mobile-driver-application',
    deliveryMethod: 'system',
    applicantName,
    applicantPhone: phone,
    applicantEmail: email,
    applicantCity: city,
    applicantLicenseClass: licenseClass,
    applicantExperience: experience,
    applicantAvailability: availability,
    applicantVehicle: vehicle,
    applicantNotes: notes,
    applicantForm: form
  });

  return jsonWithMobileCors(request, {
    ok: true,
    applicationId
  });
}

export function OPTIONS(request) {
  return buildMobileCorsPreflightResponse(request);
}