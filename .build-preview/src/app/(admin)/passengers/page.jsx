import ModulePage from '@/components/nemt/ModulePage';

export const metadata = {
  title: 'Passengers'
};

const PassengersPage = () => {
  return <ModulePage title="Passengers" description="Listado base de pacientes o pasajeros con aseguradora, movilidad y contacto principal." stats={[{
      label: 'Active passengers',
      value: '311'
    }, {
      label: 'Wheelchair riders',
      value: '67'
    }, {
      label: 'Recurring trips',
      value: '128'
    }, {
      label: 'Inactive',
      value: '11'
    }]} actions={[{
      label: 'Add passenger'
    }, {
      label: 'Import roster',
      variant: 'success'
    }]} columns={['Passenger', 'DOB', 'Mobility', 'Insurance', 'Primary contact']} rows={[["Kenneth Pena", '03/12/1960', 'Ambulatory', 'Simply Healthcare', 'Marta Pena'], ["Mary Smith", '10/24/1954', 'Wheelchair', 'Molina', 'Sarah Smith'], ["William King", '07/15/1958', 'Ambulatory', 'Humana', 'Patricia King'], ["Arleenruth Burns", '11/01/1949', 'Stretcher', 'Medicaid', 'James Burns']]} />;
};

export default PassengersPage;