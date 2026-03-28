import ModulePage from '@/components/nemt/ModulePage';

export const metadata = {
  title: 'System Messages'
};

const SystemMessagesPage = () => {
  return <ModulePage title="System Messages" description="Mensajes internos, alertas operativas y avisos listos para enviar o revisar." stats={[{
      label: 'Unread',
      value: '0'
    }, {
      label: 'Driver alerts',
      value: '0'
    }, {
      label: 'Dispatch alerts',
      value: '0'
    }, {
      label: 'Templates',
      value: '0'
    }]} actions={[{
      label: 'New message'
    }, {
      label: 'Open chat',
      href: '/driver-chat',
      variant: 'outline-secondary'
    }]} columns={['Time', 'Audience', 'Subject', 'Priority', 'Status']} rows={[["No messages", 'System', 'Waiting messages', 'Normal', 'Idle']]} />;
};

export default SystemMessagesPage;