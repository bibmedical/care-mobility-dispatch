import ModulePage from '@/components/nemt/ModulePage';

export const metadata = {
  title: 'Daily Driver Snapshot'
};

const DailyDriverSnapshotPage = () => {
  return <ModulePage title="Daily Driver Snapshot" description="Daily snapshot per driver showing status, checkpoint, trips and shift performance." stats={[{
      label: 'Drivers reported',
      value: '0'
    }, {
      label: 'Checked in',
      value: '0'
    }, {
      label: 'Tracked',
      value: '0'
    }, {
      label: 'Exceptions',
      value: '0'
    }]} actions={[{
      label: 'Generate snapshot'
    }, {
      label: 'Drivers',
      href: '/drivers',
      variant: 'outline-secondary'
    }]} columns={['Driver', 'Checkpoint', 'Trips', 'Status', 'Notes']} rows={[["No drivers loaded", 'No GPS', '0', 'Pending', '-']]} />;
};

export default DailyDriverSnapshotPage;