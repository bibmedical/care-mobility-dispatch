import PageTitle from '@/components/PageTitle';
import { readSystemMessages } from '@/server/system-messages-store';
import { Badge, Card, CardBody, Col, Row } from 'react-bootstrap';

export const metadata = {
  title: 'Driver Applications'
};

const formatDateTime = value => {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const yesNoLabel = value => {
  if (String(value || '').trim().toLowerCase() === 'yes') return 'Yes';
  if (String(value || '').trim().toLowerCase() === 'no') return 'No';
  return '-';
};

const isFilled = value => String(value || '').trim().length > 0;

const formatApplicantName = application => {
  const form = application?.applicantForm;
  const fromForm = [form?.firstName, form?.middleName, form?.lastName].filter(Boolean).join(' ').trim();
  return fromForm || application?.applicantName || 'Unnamed applicant';
};

const formatEmployerPeriod = (from, to) => {
  const parts = [String(from || '').trim(), String(to || '').trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(' to ') : '-';
};

const DetailList = ({ items }) => {
  const visibleItems = items.filter(item => isFilled(item?.value));
  if (visibleItems.length === 0) {
    return <p className="text-muted small mb-0">No details provided.</p>;
  }

  return <Row className="g-3">
      {visibleItems.map(item => <Col md={6} xl={4} key={item.label}>
          <div className="border rounded p-3 h-100 bg-light-subtle">
            <div className="text-muted text-uppercase small fw-semibold mb-1">{item.label}</div>
            <div className="fw-semibold" style={{ whiteSpace: 'pre-wrap' }}>{item.value}</div>
          </div>
        </Col>)}
    </Row>;
};

const EmploymentBlock = ({ title, prefix, form }) => {
  const name = form?.[`${prefix}Name`];
  const phone = form?.[`${prefix}Phone`];
  const address = form?.[`${prefix}Address`];
  const position = form?.[`${prefix}Position`];
  const from = form?.[`${prefix}From`];
  const to = form?.[`${prefix}To`];
  const reason = form?.[`${prefix}Reason`];
  const salary = form?.[`${prefix}Salary`];
  const gaps = form?.[`${prefix}Gaps`];
  const fmcsa = form?.[`${prefix}Fmcsa`];
  const safetySensitive = form?.[`${prefix}SafetySensitive`];
  const hasAny = [name, phone, address, position, from, to, reason, salary, gaps, fmcsa, safetySensitive].some(isFilled);

  if (!hasAny) return null;

  return <div className="border rounded p-3 mb-3">
      <h6 className="mb-3">{title}</h6>
      <DetailList items={[
        { label: 'Name', value: name },
        { label: 'Phone', value: phone },
        { label: 'Address', value: address },
        { label: 'Position held', value: position },
        { label: 'Employment period', value: formatEmployerPeriod(from, to) },
        { label: 'Reason for leaving', value: reason },
        { label: 'Salary', value: salary },
        { label: 'Gaps in employment', value: gaps },
        { label: 'Subject to FMCSR', value: yesNoLabel(fmcsa) },
        { label: 'Safety-sensitive DOT role', value: yesNoLabel(safetySensitive) }
      ]} />
    </div>;
};

const DriverApplicationsPage = async () => {
  const messages = await readSystemMessages().catch(() => []);
  const applications = messages
    .filter(message => String(message?.type || '').trim() === 'driver-application')
    .sort((left, right) => new Date(right?.createdAt || 0).getTime() - new Date(left?.createdAt || 0).getTime());
  const newCount = applications.filter(message => String(message?.status || 'active').trim().toLowerCase() === 'active').length;
  const cityCount = new Set(applications.map(message => String(message?.applicantCity || message?.applicantForm?.currentCity || '').trim()).filter(Boolean)).size;

  return <>
      <PageTitle title="Driver Applications" subName="Operations" />
      <Row className="g-3 mb-3">
        <Col md={6} xl={3}>
          <Card className="h-100">
            <CardBody>
              <p className="text-muted mb-2">Applications received</p>
              <h4 className="mb-0">{applications.length}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card className="h-100">
            <CardBody>
              <p className="text-muted mb-2">Active queue</p>
              <h4 className="mb-0">{newCount}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card className="h-100">
            <CardBody>
              <p className="text-muted mb-2">Cities represented</p>
              <h4 className="mb-0">{cityCount}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card className="h-100">
            <CardBody>
              <p className="text-muted mb-2">Source</p>
              <h4 className="mb-0">App Login</h4>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Card>
        <CardBody>
          <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-3">
            <div>
              <h5 className="mb-1">Driver Applications</h5>
              <p className="text-muted mb-0">Applications sent from the app arrive here from the login screen and are also saved as System Messages for Dispatch Leadership. The new long-form driver application is shown section by section below.</p>
            </div>
            <Badge bg="primary">Web intake queue</Badge>
          </div>
          {applications.length > 0 ? <div className="d-flex flex-column gap-3">
              {applications.map(application => {
                const form = application?.applicantForm || {};
                const applicantName = formatApplicantName(application);

                return <Card key={application.id} className="border">
                    <CardBody className="d-flex flex-column gap-3">
                      <div className="d-flex flex-column flex-lg-row justify-content-between gap-3">
                        <div>
                          <h5 className="mb-1">{applicantName}</h5>
                          <div className="text-muted small">{form.positionApplied || application.applicantVehicle || 'Driver application'}</div>
                        </div>
                        <div className="d-flex flex-wrap gap-2 align-items-start">
                          <Badge bg={String(application?.status || 'active').trim().toLowerCase() === 'active' ? 'success' : 'secondary'}>{application.status || 'active'}</Badge>
                          <Badge bg="light" text="dark">{formatDateTime(application.createdAt)}</Badge>
                        </div>
                      </div>

                      <DetailList items={[
                        { label: 'Phone', value: form.phone || application.applicantPhone },
                        { label: 'Email', value: form.email || application.applicantEmail },
                        { label: 'Current city', value: form.currentCity || application.applicantCity },
                        { label: 'Position applied for', value: form.positionApplied },
                        { label: 'Date available', value: form.dateAvailable || application.applicantAvailability },
                        { label: 'Legal right to work', value: yesNoLabel(form.legalRightToWork) },
                        { label: 'Date of birth', value: form.dateOfBirth },
                        { label: 'Social Security #', value: form.socialSecurityNumber },
                        { label: 'License class', value: form.licenseTypeClass || application.applicantLicenseClass },
                        { label: 'Endorsements', value: form.licenseEndorsements },
                        { label: 'License expiration', value: form.licenseExpirationDate },
                        { label: 'Other qualifications', value: form.otherQualifications || application.applicantNotes }
                      ]} />

                      <details>
                        <summary className="fw-semibold">Residency and license details</summary>
                        <div className="pt-3 d-flex flex-column gap-3">
                          <DetailList items={[
                            { label: 'Current address', value: [form.currentStreet, form.currentCity, form.currentState, form.currentZip].filter(Boolean).join(', ') },
                            { label: 'Years at current address', value: form.currentYears },
                            { label: 'Mailing address', value: [form.mailingStreet, form.mailingCity, form.mailingState, form.mailingZip].filter(Boolean).join(', ') },
                            { label: 'Years at mailing address', value: form.mailingYears },
                            { label: 'Previous address 1', value: [form.previousStreet1, form.previousCity1, form.previousState1, form.previousZip1].filter(Boolean).join(', ') },
                            { label: 'Years at previous address 1', value: form.previousYears1 },
                            { label: 'Previous address 2', value: [form.previousStreet2, form.previousCity2, form.previousState2, form.previousZip2].filter(Boolean).join(', ') },
                            { label: 'Years at previous address 2', value: form.previousYears2 },
                            { label: 'Previous address 3', value: [form.previousStreet3, form.previousCity3, form.previousState3, form.previousZip3].filter(Boolean).join(', ') },
                            { label: 'Years at previous address 3', value: form.previousYears3 },
                            { label: 'Current license', value: [form.licenseState, form.licenseNumber, form.licenseTypeClass, form.licenseEndorsements, form.licenseExpirationDate].filter(Boolean).join(' | ') },
                            { label: 'Previous license 1', value: [form.previousLicenseState1, form.previousLicenseNumber1, form.previousLicenseTypeClass1, form.previousLicenseEndorsements1, form.previousLicenseExpirationDate1].filter(Boolean).join(' | ') },
                            { label: 'Previous license 2', value: [form.previousLicenseState2, form.previousLicenseNumber2, form.previousLicenseTypeClass2, form.previousLicenseEndorsements2, form.previousLicenseExpirationDate2].filter(Boolean).join(' | ') }
                          ]} />
                        </div>
                      </details>

                      <details>
                        <summary className="fw-semibold">Driving experience, accidents, and convictions</summary>
                        <div className="pt-3 d-flex flex-column gap-3">
                          <DetailList items={[
                            { label: 'Straight truck', value: [form.straightTruckType, formatEmployerPeriod(form.straightTruckFrom, form.straightTruckTo), form.straightTruckMiles ? `${form.straightTruckMiles} miles` : ''].filter(Boolean).join(' | ') },
                            { label: 'Tractor and semi-trailer', value: [form.tractorSemiType, formatEmployerPeriod(form.tractorSemiFrom, form.tractorSemiTo), form.tractorSemiMiles ? `${form.tractorSemiMiles} miles` : ''].filter(Boolean).join(' | ') },
                            { label: 'Tractor and 2 trailers', value: [form.tractorTwoTrailersType, formatEmployerPeriod(form.tractorTwoTrailersFrom, form.tractorTwoTrailersTo), form.tractorTwoTrailersMiles ? `${form.tractorTwoTrailersMiles} miles` : ''].filter(Boolean).join(' | ') },
                            { label: 'Tractor and tanker', value: [form.tractorTankerType, formatEmployerPeriod(form.tractorTankerFrom, form.tractorTankerTo), form.tractorTankerMiles ? `${form.tractorTankerMiles} miles` : ''].filter(Boolean).join(' | ') },
                            { label: 'Other equipment', value: [form.otherEquipmentType, formatEmployerPeriod(form.otherEquipmentFrom, form.otherEquipmentTo), form.otherEquipmentMiles ? `${form.otherEquipmentMiles} miles` : ''].filter(Boolean).join(' | ') },
                            { label: 'Accident 1', value: [form.accidentDate1, form.accidentNature1, form.accidentFatalities1 ? `Fatalities: ${form.accidentFatalities1}` : '', form.accidentInjuries1 ? `Injuries: ${form.accidentInjuries1}` : '', form.accidentChemicalSpills1 ? `Chemical spills: ${form.accidentChemicalSpills1}` : ''].filter(Boolean).join(' | ') },
                            { label: 'Accident 2', value: [form.accidentDate2, form.accidentNature2, form.accidentFatalities2 ? `Fatalities: ${form.accidentFatalities2}` : '', form.accidentInjuries2 ? `Injuries: ${form.accidentInjuries2}` : '', form.accidentChemicalSpills2 ? `Chemical spills: ${form.accidentChemicalSpills2}` : ''].filter(Boolean).join(' | ') },
                            { label: 'Accident 3', value: [form.accidentDate3, form.accidentNature3, form.accidentFatalities3 ? `Fatalities: ${form.accidentFatalities3}` : '', form.accidentInjuries3 ? `Injuries: ${form.accidentInjuries3}` : '', form.accidentChemicalSpills3 ? `Chemical spills: ${form.accidentChemicalSpills3}` : ''].filter(Boolean).join(' | ') },
                            { label: 'Conviction 1', value: [form.convictionDate1, form.convictionViolation1, form.convictionState1, form.convictionPenalty1].filter(Boolean).join(' | ') },
                            { label: 'Conviction 2', value: [form.convictionDate2, form.convictionViolation2, form.convictionState2, form.convictionPenalty2].filter(Boolean).join(' | ') },
                            { label: 'Conviction 3', value: [form.convictionDate3, form.convictionViolation3, form.convictionState3, form.convictionPenalty3].filter(Boolean).join(' | ') },
                            { label: 'Denied license', value: yesNoLabel(form.deniedLicense) },
                            { label: 'Denied license explanation', value: form.deniedLicenseExplanation },
                            { label: 'Suspended or revoked license', value: yesNoLabel(form.suspendedLicense) },
                            { label: 'Suspension explanation', value: form.suspendedLicenseExplanation }
                          ]} />
                        </div>
                      </details>

                      <details>
                        <summary className="fw-semibold">Employment, education, and signature</summary>
                        <div className="pt-3 d-flex flex-column gap-3">
                          <EmploymentBlock title="Current employer" prefix="currentEmployer" form={form} />
                          <EmploymentBlock title="Second employer" prefix="secondEmployer" form={form} />
                          <EmploymentBlock title="Third employer" prefix="thirdEmployer" form={form} />

                          <DetailList items={[
                            { label: 'High school', value: [form.highSchoolName, form.highSchoolCourse, form.highSchoolYears ? `Years: ${form.highSchoolYears}` : '', form.highSchoolGraduate ? `Graduate: ${yesNoLabel(form.highSchoolGraduate)}` : '', form.highSchoolDetails].filter(Boolean).join(' | ') },
                            { label: 'College', value: [form.collegeName, form.collegeCourse, form.collegeYears ? `Years: ${form.collegeYears}` : '', form.collegeGraduate ? `Graduate: ${yesNoLabel(form.collegeGraduate)}` : '', form.collegeDetails].filter(Boolean).join(' | ') },
                            { label: 'Other school', value: [form.otherSchoolName, form.otherSchoolCourse, form.otherSchoolYears ? `Years: ${form.otherSchoolYears}` : '', form.otherSchoolGraduate ? `Graduate: ${yesNoLabel(form.otherSchoolGraduate)}` : '', form.otherSchoolDetails].filter(Boolean).join(' | ') },
                            { label: 'Applicant signature', value: form.applicantSignature },
                            { label: 'Applicant printed name', value: form.applicantPrintedName }
                          ]} />
                        </div>
                      </details>
                    </CardBody>
                  </Card>;
              })}
            </div> : <div className="text-center text-muted py-4">No driver applications received yet.</div>}
        </CardBody>
      </Card>
    </>;
};

export default DriverApplicationsPage;