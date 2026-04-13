import PageMemoryProbeClient from '@/components/PageMemoryProbeClient';
import AdminSidebarGate from '@/components/layouts/AdminSidebarGate';
import AdminQuickNav from '@/components/nemt/AdminQuickNav';
import React from 'react';
import { Container } from 'react-bootstrap';
const layout = ({
  children
}) => {
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <AdminSidebarGate />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh' }}>
        <div className="page-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh' }}>
          <div className="page-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh', marginLeft: 0 }}>
            <PageMemoryProbeClient />
            <Container fluid style={{ flex: 1, minWidth: 0, height: '100vh', display: 'flex', flexDirection: 'column', paddingLeft: 0, paddingRight: 0 }}>
              <AdminQuickNav />
              <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                {children}
              </div>
            </Container>
          </div>
        </div>
      </div>
    </div>
  );
};
export default layout;