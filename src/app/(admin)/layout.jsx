import PageMemoryProbeClient from '@/components/PageMemoryProbeClient';
import AdminSidebarGate from '@/components/layouts/AdminSidebarGate';
import AdminQuickNav from '@/components/nemt/AdminQuickNav';
import React from 'react';
import { Container } from 'react-bootstrap';
const layout = ({
  children
}) => {
  return (
    <div style={{ display: 'flex', height: '100dvh', width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
      <AdminSidebarGate />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, height: '100%' }}>
        <div className="page-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, height: '100%' }}>
          <div className="page-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, height: '100%', marginLeft: 0 }}>
            <PageMemoryProbeClient />
            <Container fluid style={{ flex: 1, minWidth: 0, minHeight: 0, height: '100%', maxWidth: '100%', display: 'flex', flexDirection: 'column', paddingLeft: 0, paddingRight: 0 }}>
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