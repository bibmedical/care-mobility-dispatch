import ModulePage from '@/components/nemt/ModulePage';

export const metadata = {
  title: 'Preferences'
};

const PreferencesPage = () => {
  return <ModulePage title="Preferences" description="General dispatch, map, notification, and system behavior settings." stats={[{
      label: 'Dispatch rules',
      value: '0'
    }, {
      label: 'Notification sets',
      value: '0'
    }, {
      label: 'Map presets',
      value: '1'
    }, {
      label: 'Default zones',
      value: '0'
    }]} actions={[{
      label: 'Save defaults'
    }, {
      label: 'Map setup',
      variant: 'outline-secondary'
    }]} columns={['Preference', 'Value', 'Scope', 'Updated', 'Owner']} rows={[["Map lock on load", 'Disabled', 'Dispatcher', 'Pending', 'System'], ["Auto-assign", 'Disabled', 'Trips', 'Pending', 'System']]} />;
};

export default PreferencesPage;