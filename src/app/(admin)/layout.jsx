import LeftSideBar from '@/components/layouts/LeftSideBar';
import React from 'react';
import { Container } from 'react-bootstrap';
const layout = ({
  children
}) => {
  return <>
      <LeftSideBar />
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