'use client';

import PageTitle from '@/components/PageTitle';
import Link from 'next/link';
import React from 'react';
import { Card, CardBody, Col, Row } from 'react-bootstrap';

const OfficeTemplatesWorkspace = () => {
  return <>
      <PageTitle title="Templates" subName="Settings / Office" />
      <Row className="g-3">
        <Col xl={8}>
          <Card>
            <CardBody>
              <h4 className="mb-2">Office Templates</h4>
              <p className="text-muted mb-3">Manage office templates for printing and documents. This module is ready for you to keep building without depending on the side menu.</p>
              <div className="d-flex gap-2 flex-wrap">
                <Link href="/settings/office" className="btn btn-outline-secondary">Volver a Office</Link>
                <Link href="/settings/office/print-setup" className="btn btn-primary">Open Print Setup</Link>
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </>;
};

export default OfficeTemplatesWorkspace;