'use client';

import PageTitle from '@/components/PageTitle';
import Link from 'next/link';
import React from 'react';
import { Button, Card, CardBody, Col, Row } from 'react-bootstrap';

const OfficeTemplatesWorkspace = () => {
  return <>
      <PageTitle title="Templates" subName="Configuraciones / Office" />
      <Row className="g-3">
        <Col xl={8}>
          <Card>
            <CardBody>
              <h4 className="mb-2">Office Templates</h4>
              <p className="text-muted mb-3">Aqui vas a manejar los templates de oficina para impresion y documentos. Te dejé este modulo listo para seguirlo llenando sin depender del menu lateral.</p>
              <div className="d-flex gap-2 flex-wrap">
                <Button as={Link} href="/settings/office" variant="outline-secondary">Volver a Office</Button>
                <Button as={Link} href="/settings/office/print-setup" variant="primary">Abrir Print Setup</Button>
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </>;
};

export default OfficeTemplatesWorkspace;