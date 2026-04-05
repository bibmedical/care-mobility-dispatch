'use client';

import React from 'react';
import { Breadcrumb, BreadcrumbItem, Col, Row } from 'react-bootstrap';
import IconifyIcon from './wrappers/IconifyIcon';
import { useLayoutContext } from '@/context/useLayoutContext';
const PageTitle = ({
  title,
  subName
}) => {
  const {
    menu
  } = useLayoutContext();
  const leftPadding = menu?.size === 'collapsed' ? 20 : 28;

  return <Row>
      <Col sm={12}>
        <div className="page-title-box d-md-flex justify-content-md-between align-items-center" style={{
        paddingLeft: leftPadding,
        flexWrap: 'wrap',
        rowGap: 8,
        transition: 'padding-left 0.3s ease'
      }}>
          <h4 className="page-title" style={{ whiteSpace: 'nowrap', marginRight: 12 }}>{title}</h4>
            <Breadcrumb className="mb-0 ms-md-auto">
              <BreadcrumbItem className='content-none'>Florida Mobility Group</BreadcrumbItem>
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