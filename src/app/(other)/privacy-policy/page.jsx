export const metadata = {
  title: 'Privacy Policy'
};

const PrivacyPolicyPage = () => {
  return (
    <div className="container py-5" style={{ maxWidth: 960 }}>
      <h1 className="mb-3">Privacy Policy</h1>
      <p className="text-muted">Last updated: April 22, 2026</p>

      <p>
        Care Mobility Services LLC ("we", "our", "us") uses SMS messaging to support
        non-emergency medical transportation operations, including trip confirmations,
        reminders, arrival alerts, schedule changes, and dispatch support.
      </p>

      <h2 className="h5 mt-4">Information We Collect</h2>
      <ul>
        <li>Contact details such as phone number and rider name.</li>
        <li>Trip-related information needed to coordinate transportation.</li>
        <li>Messaging records such as timestamps, message status, and responses.</li>
      </ul>

      <h2 className="h5 mt-4">How We Use Information</h2>
      <ul>
        <li>Send transactional transportation updates and confirmations.</li>
        <li>Coordinate dispatch and improve service reliability.</li>
        <li>Maintain delivery and compliance logs.</li>
      </ul>

      <h2 className="h5 mt-4">SMS Consent and Sharing</h2>
      <p>
        SMS consent is not shared with third parties or affiliates for marketing purposes.
        We do not sell personal data.
      </p>

      <h2 className="h5 mt-4">Data Security</h2>
      <p>
        We use administrative, technical, and organizational safeguards to protect the
        information we process.
      </p>

      <h2 className="h5 mt-4">Your Choices</h2>
      <ul>
        <li>Reply STOP to opt out of SMS messages.</li>
        <li>Reply HELP for support with messaging.</li>
      </ul>

      <h2 className="h5 mt-4">Contact</h2>
      <p>
        For privacy questions, contact Care Mobility Services LLC.
      </p>
    </div>
  );
};

export default PrivacyPolicyPage;