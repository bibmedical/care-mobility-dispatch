import PageMemoryProbeClient from '@/components/PageMemoryProbeClient';
import AdminSidebarGate from '@/components/layouts/AdminSidebarGate';
import AdminQuickNav from '@/components/nemt/AdminQuickNav';
import React from 'react';
import { Container } from 'react-bootstrap';
const layout = ({
  children
}) => {
  return (
    <div style={{ display: 'flex', width: '100%', maxWidth: '100%', minWidth: 0, minHeight: '100dvh', overflow: 'hidden' }}>
      <AdminSidebarGate />
      <div className="page-wrapper" style={{ flex: 1, minWidth: 0, marginLeft: 0 }}>
        <div className="page-content" style={{ marginLeft: 0, minWidth: 0 }}>
          <PageMemoryProbeClient />
          <Container fluid style={{ minWidth: 0, paddingLeft: 0, paddingRight: 0 }}>
            <AdminQuickNav />
            <div style={{ minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              {children}
            </div>
          </Container>
        </div>
      </div>
    </div>
  );
};
export default layout;