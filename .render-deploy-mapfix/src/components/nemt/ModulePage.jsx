"use client";

import PageTitle from '@/components/PageTitle';
import React from 'react';
import { Badge, Button, Card, CardBody, Col, Row, Table } from 'react-bootstrap';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const ModulePage = ({
  title,
  subName = 'Operations',
  description,
  stats = [],
  actions = [],
  columns = [],
  rows = []
}) => {
  const router = useRouter();
  const [message, setMessage] = useState('Listo para trabajar.');

  const handleAction = action => {
    if (action.href) {
      router.push(action.href);
      return;
    }
    setMessage(action.message ?? `${action.label} listo.`);
  };

  return <>
      <PageTitle title={title} subName={subName} />
      <Row className="g-3 mb-3">
        {stats.map(stat => <Col md={6} xl={3} key={stat.label}>
            <Card className="h-100">
              <CardBody>
                <p className="text-muted mb-2">{stat.label}</p>
                <div className="d-flex justify-content-between align-items-center">
                  <h4 className="mb-0">{stat.value}</h4>
                  {stat.badge ? <Badge bg="primary-subtle" text="primary">{stat.badge}</Badge> : null}
                </div>
              </CardBody>
            </Card>
          </Col>)}
      </Row>
      <Card>
        <CardBody>
          <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-3">
            <div>
              <h5 className="mb-1">{title}</h5>
              <p className="text-muted mb-0">{description}</p>
              <div className="small text-muted mt-2">{message}</div>
            </div>
            <div className="d-flex flex-wrap gap-2">
              {actions.map(action => <Button key={action.label} variant={action.variant ?? 'outline-primary'} onClick={() => handleAction(action)}>
                  {action.label}
                </Button>)}
            </div>
          </div>
          <div className="table-responsive">
            <Table className="table-centered align-middle mb-0">
              <thead className="table-light">
                <tr>
                  {columns.map(column => <th key={column}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => <tr key={index}>
                    {row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}
                  </tr>)}
              </tbody>
            </Table>
          </div>
        </CardBody>
      </Card>
    </>;
};

export default ModulePage;