import LeftSideBar from '@/components/layouts/LeftSideBar';
import LeftSideBarToggle from '@/components/layouts/TopBar/components/LeftSideBarToggle';
import React from 'react';
import { Container } from 'react-bootstrap';
const layout = ({
  children
}) => {
  return <>
      <LeftSideBar />
      <div className="d-print-none" style={{ position: 'fixed', left: 10, top: 10, zIndex: 2100 }}>
        <LeftSideBarToggle />
      </div>
      <div className="startbar-overlay d-print-none" />
      <div className="page-wrapper">
        <div className="page-content">
          <Container fluid>
            {children}
          </Container>
        </div>
      </div>
    </>;
};
export default layout;