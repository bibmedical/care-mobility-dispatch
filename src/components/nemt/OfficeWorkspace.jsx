'use client';

import PageTitle from '@/components/PageTitle';
import Link from 'next/link';
import React from 'react';
import { Button, Card, CardBody, Col, Row } from 'react-bootstrap';

const OfficeWorkspace = () => {
  return <>
      <PageTitle title="Office" subName="Configuraciones" />
      <Row className="g-3">
        <Col xl={4}>
          <Card>
            <CardBody>
              <h4 className="mb-2">Print Setup</h4>
              <p className="text-muted mb-3">Escoge el template que quieres usar al imprimir rutas.</p>
              <Button as={Link} href="/settings/office/print-setup" variant="primary">Abrir Print Setup</Button>
            </CardBody>
          </Card>
        </Col>
        <Col xl={4}>
          <Card>
            <CardBody>
              <h4 className="mb-2">Templates</h4>
              <p className="text-muted mb-3">Prepara formatos de oficina y deja este espacio listo para mas layouts.</p>
              <Button as={Link} href="/settings/office/templates" variant="outline-secondary">Abrir Templates</Button>
            </CardBody>
          </Card>
        </Col>
        <Col xl={4}>
          <Card>
            <CardBody>
              <h4 className="mb-2">Printers</h4>
              <p className="text-muted mb-3">Deja un modulo separado para impresoras y destinos de impresion.</p>
              <Button as={Link} href="/settings/office/printers" variant="outline-secondary">Abrir Printers</Button>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </>;
};

export default OfficeWorkspace;