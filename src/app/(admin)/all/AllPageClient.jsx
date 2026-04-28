'use client';

import Link from 'next/link';
import PageTitle from '@/components/PageTitle';
import useUserPreferencesApi from '@/hooks/useUserPreferencesApi';
import { Alert, Badge, Button, Card, CardBody, Col, Row, Table } from 'react-bootstrap';

const SCREEN_GROUPS = [{
  title: 'Dispatch Core (In Use)',
  items: [{ label: 'Dispatcher', url: '/dispatcher' }, { label: 'Trip Dashboard', url: '/trip-dashboard' }, { label: 'Confirmation', url: '/confirmation' }, { label: 'Route Control', url: '/route-control' }, { label: 'Map Screen', url: '/map-screen' }, { label: 'Fuel Requests', url: '/fuel-requests' }]
}, {
  title: 'Operations And Admin (In Use)',
  items: [{ label: 'Vehicles', url: '/drivers/vehicles' }, { label: 'Billing', url: '/billing' }, { label: 'GPS', url: '/settings/gps' }, { label: 'Office', url: '/settings/office' }, { label: 'Email Templates', url: '/settings/email-templates' }, { label: 'Page Memory', url: '/settings/page-memory' }, { label: 'User Management', url: '/user-management' }, { label: 'Avatar', url: '/avatar' }]
}];

const TOOLBAR_BLOCKS = [{ row: 'Row 1', id: 'date-controls', label: 'Date controls' }, { row: 'Row 1', id: 'trip-search', label: 'Search' }, { row: 'Row 1', id: 'driver-assigned', label: 'Assigned' }, { row: 'Row 1', id: 'action-buttons', label: 'Actions' }, { row: 'Row 1', id: 'leg-buttons', label: 'Leg' }, { row: 'Row 1', id: 'type-buttons', label: 'Tipo' }, { row: 'Row 1', id: 'closed-route', label: 'Close route' }, { row: 'Row 2', id: 'show-map', label: 'Show map' }, { row: 'Row 2', id: 'peek-panel', label: 'Panel peek' }, { row: 'Row 2', id: 'toolbar-edit', label: 'Toolbar editor' }, { row: 'Row 2', id: 'layout', label: 'Layout' }, { row: 'Row 2', id: 'panels', label: 'Panels' }, { row: 'Row 2', id: 'trip-order', label: 'Trip order' }, { row: 'Row 3', id: 'driver-select', label: 'Primary driver' }, { row: 'Row 3', id: 'secondary-driver', label: 'Secondary driver' }, { row: 'Row 3', id: 'zip-filter', label: 'ZIP filter' }, { row: 'Row 3', id: 'route-filter', label: 'Route filter' }, { row: 'Row 3', id: 'theme-toggle', label: 'Tema' }, { row: 'Row 3', id: 'metric-miles', label: 'Miles metric' }, { row: 'Row 3', id: 'metric-duration', label: 'Duration metric' }];

const PANEL_BUTTONS = [{ key: 'showDriversPanel', label: 'Drivers', note: 'Returns the drivers panel when hidden' }, { key: 'showRoutesPanel', label: 'Routes', note: 'Returns the routes panel when hidden' }, { key: 'showTripsPanel', label: 'Trips', note: 'Returns the trips panel when hidden from dispatcher surface' }];

const AllPageClient = () => {
  const { data, loading, error } = useUserPreferencesApi();
  const toolbarVisibility = data?.tripDashboard?.toolbarVisibility || {};
  const hiddenToolbarBlocks = TOOLBAR_BLOCKS.filter(block => toolbarVisibility[block.id] === false);
  const hiddenPanels = PANEL_BUTTONS.filter(panel => data?.tripDashboard?.[panel.key] === false);

  return <>
      <PageTitle title="All" subName="Operations" />

      <Alert variant="info" className="mb-3">
        This page shows what the Trip Dashboard uses and what is currently hidden in your own preferences.
      </Alert>

      <Row className="g-3 mb-3">
        <Col xl={8}>
          <Card className="h-100">
            <CardBody>
              <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
                <h5 className="mb-0">Now Hidden In Your Trip Dashboard</h5>
                <div className="d-flex gap-2 flex-wrap">
                  <Badge bg={loading ? 'secondary' : hiddenToolbarBlocks.length ? 'danger' : 'success'}>
                    Toolbar hidden: {loading ? 'loading...' : hiddenToolbarBlocks.length}
                  </Badge>
                  <Badge bg={loading ? 'secondary' : hiddenPanels.length ? 'danger' : 'success'}>
                    Panels hidden: {loading ? 'loading...' : hiddenPanels.length}
                  </Badge>
                </div>
              </div>

              {error ? <Alert variant="warning" className="mb-3">{error}</Alert> : null}

              {!loading && hiddenToolbarBlocks.length === 0 ? <Alert variant="success" className="mb-0">All toolbar blocks are visible right now.</Alert> : null}

              {!loading && hiddenToolbarBlocks.length > 0 ? <Table responsive hover size="sm" className="mb-0 align-middle">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Id</th>
                      <th>Label</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hiddenToolbarBlocks.map(block => <tr key={block.id}>
                        <td>{block.row}</td>
                        <td><code>{block.id}</code></td>
                        <td>{block.label}</td>
                      </tr>)}
                  </tbody>
                </Table> : null}
            </CardBody>
          </Card>
        </Col>

        <Col xl={4}>
          <Card className="h-100">
            <CardBody>
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h5 className="mb-0">Hidden Panels</h5>
                <Badge bg={loading ? 'secondary' : hiddenPanels.length ? 'danger' : 'success'}>{loading ? 'loading...' : hiddenPanels.length}</Badge>
              </div>
              <div className="d-flex flex-column gap-2">
                {PANEL_BUTTONS.map(panel => {
                  const isHidden = data?.tripDashboard?.[panel.key] === false;
                  return <div key={panel.label} className="border rounded p-3">
                      <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
                        <div className="fw-semibold">{panel.label}</div>
                        <Badge bg={isHidden ? 'danger' : 'success'}>{isHidden ? 'Hidden' : 'Visible'}</Badge>
                      </div>
                      <div className="small text-muted">{panel.note}</div>
                    </div>;
                })}
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Row className="g-3 mb-3">
        {SCREEN_GROUPS.map(group => <Col xl={4} md={6} key={group.title}>
            <Card className="h-100">
              <CardBody>
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <h5 className="mb-0">{group.title}</h5>
                  <Badge bg="secondary">{group.items.length}</Badge>
                </div>
                <div className="d-flex flex-column gap-2">
                  {group.items.map(item => <Button as={Link} href={item.url} key={item.url} variant="outline-primary" className="text-start">
                      {item.label}
                    </Button>)}
                </div>
              </CardBody>
            </Card>
          </Col>)}
      </Row>

      <Card>
        <CardBody>
          <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
            <h5 className="mb-0">All Toolbar Blocks Used By Trip Dashboard</h5>
            <Badge bg="dark">{TOOLBAR_BLOCKS.length} blocks</Badge>
          </div>
          <Table responsive hover size="sm" className="mb-0 align-middle">
            <thead>
              <tr>
                <th>Row</th>
                <th>Id</th>
                <th>Label</th>
              </tr>
            </thead>
            <tbody>
              {TOOLBAR_BLOCKS.map(block => {
                const isHidden = toolbarVisibility[block.id] === false;
                return <tr key={block.id}>
                    <td>{block.row}</td>
                    <td><code>{block.id}</code></td>
                    <td>{block.label}</td>
                    <td className="text-end"><Badge bg={isHidden ? 'danger' : 'success'}>{isHidden ? 'Hidden now' : 'Visible now'}</Badge></td>
                  </tr>;
              })}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </>;
};

export default AllPageClient;
