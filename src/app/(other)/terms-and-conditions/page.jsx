export const metadata = {
  title: 'Terms and Conditions'
};

const TermsAndConditionsPage = () => {
  return (
    <div className="container py-5" style={{ maxWidth: 960 }}>
      <h1 className="mb-3">Terms and Conditions</h1>
      <p className="text-muted">Last updated: April 22, 2026</p>

      <p>
        These SMS Terms and Conditions apply to messages sent by Care Mobility Services LLC
        regarding non-emergency medical transportation services.
      </p>

      <h2 className="h5 mt-4">Program Description</h2>
      <p>
        You may receive transactional SMS messages such as trip confirmations, reminders,
        arrival notices, schedule changes, and dispatch updates.
      </p>

      <h2 className="h5 mt-4">Message Frequency</h2>
      <p>
        Message frequency varies based on your transportation activity and scheduled trips.
      </p>

      <h2 className="h5 mt-4">Message and Data Rates</h2>
      <p>
        Message and data rates may apply depending on your mobile carrier plan.
      </p>

      <h2 className="h5 mt-4">Opt-Out</h2>
      <p>
        You can opt out at any time by replying STOP to any message.
      </p>

      <h2 className="h5 mt-4">Help</h2>
      <p>
        For support, reply HELP to any message.
      </p>

      <h2 className="h5 mt-4">Consent</h2>
      <p>
        By providing your phone number and requesting transportation service updates,
        you consent to receive SMS messages related to your service.
      </p>

      <h2 className="h5 mt-4">Contact</h2>
      <p>
        Care Mobility Services LLC, United States.
      </p>
    </div>
  );
};

export default TermsAndConditionsPage;