import PageMemoryProbeClient from '@/components/PageMemoryProbeClient';
import AdminQuickNav from '@/components/nemt/AdminQuickNav';
import React from 'react';
import { Container } from 'react-bootstrap';
const layout = ({
  children
}) => {
  return (
    <div className="page-wrapper">
      <div className="page-content" style={{ marginLeft: 0 }}>
        <PageMemoryProbeClient />
        <Container fluid style={{ minWidth: 0, paddingLeft: 0, paddingRight: 0 }}>
          <AdminQuickNav />
          <div style={{ minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {children}
          </div>
        </Container>
      </div>
    </div>
  );
};
export default layout;