'use client';

import PageTitle from '@/components/PageTitle';
import Link from 'next/link';
import React, { useState } from 'react';
import { Button, Card, CardBody, Col, Row } from 'react-bootstrap';

const OfficeWorkspace = () => {
  const [cacheMessage, setCacheMessage] = useState('');
  const [clearingCache, setClearingCache] = useState(false);

  const handleClearBrowserData = async () => {
    setClearingCache(true);
    setCacheMessage('Clearing browser cache and local data...');

    try {
      if (typeof window !== 'undefined') {
        window.localStorage.clear();
        window.sessionStorage.clear();
      }

      if (typeof window !== 'undefined' && 'caches' in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.map(cacheKey => window.caches.delete(cacheKey)));
      }

      setCacheMessage('Cache/data cleared. Reloading now...');
      window.setTimeout(() => {
        window.location.reload();
      }, 350);
    } catch (error) {
      setCacheMessage(`Could not clear cache automatically: ${error?.message || 'unknown error'}`);
      setClearingCache(false);
    }
  };

  return <>
      <PageTitle title="Office" subName="Settings" />
      <Row className="g-3">
        <Col xl={4}>
          <Card>
            <CardBody>
              <h4 className="mb-2">Print Setup</h4>
              <p className="text-muted mb-3">Choose the template you want to use when printing routes.</p>
              <Button as={Link} href="/settings/office/print-setup" variant="primary">Open Print Setup</Button>
            </CardBody>
          </Card>
        </Col>
        <Col xl={4}>
          <Card>
            <CardBody>
              <h4 className="mb-2">Templates</h4>
              <p className="text-muted mb-3">Prepare office templates and keep this space ready for more layouts.</p>
              <Button as={Link} href="/settings/office/templates" variant="outline-secondary">Open Templates</Button>
            </CardBody>
          </Card>
        </Col>
        <Col xl={4}>
          <Card>
            <CardBody>
              <h4 className="mb-2">Printers</h4>
              <p className="text-muted mb-3">Keep a separate module for printers and print destinations.</p>
              <Button as={Link} href="/settings/office/printers" variant="outline-secondary">Open Printers</Button>
            </CardBody>
          </Card>
        </Col>
        <Col xl={4}>
          <Card>
            <CardBody>
              <h4 className="mb-2">Browser Data</h4>
              <p className="text-muted mb-3">Clear cache, localStorage, and sessionStorage to force the latest deployed version.</p>
              <Button variant="outline-danger" onClick={handleClearBrowserData} disabled={clearingCache}>{clearingCache ? 'Clearing...' : 'Clear Cache & Data'}</Button>
              {cacheMessage ? <div className="small mt-2 text-muted">{cacheMessage}</div> : null}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </>;
};

export default OfficeWorkspace;