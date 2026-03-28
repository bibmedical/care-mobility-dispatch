import ModulePage from '@/components/nemt/ModulePage';

export const metadata = {
  title: 'Care Calendar'
};

const CareCalendarPage = () => {
  return <ModulePage title="Care Calendar" description="Agenda de citas, tratamientos y series de viajes recurrentes para coordinacion NEMT." stats={[{
      label: 'Appointments today',
      value: '33'
    }, {
      label: 'Recurring schedules',
      value: '18'
    }, {
      label: 'Weekend rides',
      value: '6'
    }, {
      label: 'Needs confirmation',
      value: '5'
    }]} actions={[{
      label: 'Add schedule'
    }, {
      label: 'Sync appointments',
      variant: 'success'
    }]} columns={['Passenger', 'Appointment', 'Pickup window', 'Destination', 'Assigned']} rows={[["Mary Smith", 'Dialysis', '09:00 - 09:20', 'West Orlando Dialysis Center', 'Vivi Dieguez'], ["William King", 'Primary care', '10:10 - 10:30', 'Lake Nona Clinic', 'Pending'], ["Kenneth Pena", 'Physical therapy', '03:00 - 03:20', 'Orlando Rehab', 'Yosbeny Torres'], ["Ramona Saldana", 'Discharge pickup', '04:15 - 04:45', 'Osceola Medical', 'Roman Torres']]} />;
};

export default CareCalendarPage;