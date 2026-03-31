import React from 'react';
import { Breadcrumb, BreadcrumbItem, Col, Row } from 'react-bootstrap';
import IconifyIcon from './wrappers/IconifyIcon';
const PageTitle = ({
  title,
  subName
}) => {
  return <Row>
      <Col sm={12}>
        <div className="page-title-box d-md-flex justify-content-md-between align-items-center" style={{ paddingLeft: 16 }}>
          <h4 className="page-title">{title}</h4>
            <Breadcrumb className="mb-0">
              <BreadcrumbItem className='content-none'>Care Mobility</BreadcrumbItem>
              <BreadcrumbItem className='content-none'><IconifyIcon icon='la:angle-double-right' /></BreadcrumbItem>
              {subName && <>
                  <BreadcrumbItem className="content-none active">{subName}</BreadcrumbItem>
                  <BreadcrumbItem className='content-none'><IconifyIcon icon='la:angle-double-right' /></BreadcrumbItem>
                </>}
              <BreadcrumbItem className="content-none">{title}</BreadcrumbItem>
            </Breadcrumb>
        </div>
      </Col>
    </Row>;
};
export default PageTitle;