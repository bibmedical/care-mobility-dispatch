import ModulePage from '@/components/nemt/ModulePage';

export const metadata = {
  title: 'Driver Chat'
};

const DriverChatPage = () => {
  return <ModulePage title="Driver Chat" description="Operational inbox for tracking driver messages and service alerts." stats={[{
      label: 'Unread threads',
      value: '9'
    }, {
      label: 'Urgent messages',
      value: '2'
    }, {
      label: 'Drivers online',
      value: '14'
    }, {
      label: 'Resolved today',
      value: '22'
    }]} actions={[{
      label: 'Open live chat'
    }, {
      label: 'Broadcast update',
      variant: 'success'
    }]} columns={['Driver', 'Last message', 'Time', 'Priority', 'Case']} rows={[["Yosbeny Torres", 'Passenger already picked up.', '10:21 AM', 'Normal', 'TR-20489'], ["Roman Torres", 'Traffic delay on I-4.', '10:10 AM', 'High', 'TR-20490'], ["Yanelis Hernandez", 'Vehicle fuel low, finishing route.', '09:58 AM', 'Normal', 'Fleet'], ["Vivi Dieguez", 'Patient needs extra assistance.', '09:41 AM', 'High', 'TR-20488']]} />;
};

export default DriverChatPage;