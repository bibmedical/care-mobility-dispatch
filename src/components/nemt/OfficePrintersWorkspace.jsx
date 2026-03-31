'use client';

import PageTitle from '@/components/PageTitle';
import Link from 'next/link';
import React from 'react';
import { Button, Card, CardBody, Col, Row } from 'react-bootstrap';

const OfficePrintersWorkspace = () => {
  return <>
      <PageTitle title="Printers" subName="Settings / Office" />
      <Row className="g-3">
        <Col xl={8}>
          <Card>
            <CardBody>
              <h4 className="mb-2">Office Printers</h4>
              <p className="text-muted mb-3">Este modulo queda listo para configurar impresoras, destinos y reglas de oficina cuando quieras agregar esa parte.</p>
              <div className="d-flex gap-2 flex-wrap">
                <Button as={Link} href="/settings/office" variant="outline-secondary">Volver a Office</Button>
                <Button as={Link} href="/settings/office/print-setup" variant="primary">Open Print Setup</Button>
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </>;
};

export default OfficePrintersWorkspace;