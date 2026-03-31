import PageTitle from '@/components/PageTitle';
import Link from 'next/link';
import { Badge, Button, Card, CardBody, Col, Row, Table } from 'react-bootstrap';

export const metadata = {
  title: 'Help'
};

const HELP_ENTRIES = [{
  module: 'AI Integrations',
  route: '/integrations/ai',
  instruction: 'Configure provider, validate keys and test operational prompts.'
}, {
  module: 'Avatar',
  route: '/avatar',
  instruction: 'Manage the visual profile and quick data of the active user.'
}, {
  module: 'Black List',
  route: '/blacklist',
  instruction: 'Review blocked passengers, reasons and restriction status.'
}, {
  module: 'Confirmation',
  route: '/confirmation',
  instruction: 'Trigger confirmations and verify passenger response queue.'
}, {
  module: 'Daily Driver Snapshot',
  route: '/daily-driver-snapshot',
  instruction: 'View daily driver snapshot with status, checkpoint, trips and shift performance.'
}, {
  module: 'Dispatcher',
  route: '/dispatcher',
  instruction: 'Assign trips, apply map filters, and monitor drivers live.'
}, {
  module: 'Driver Efficiency Report',
  route: '/driver-efficiency-report',
  instruction: 'Measure efficiency by block, idle time and compliance.'
}, {
  module: 'Drivers',
  route: '/drivers',
  instruction: 'Edit drivers, licenses and operational availability status.'
}, {
  module: 'Email Templates',
  route: '/settings/email-templates',
  instruction: 'Update templates for alerts, expirations and automated messages.'
}, {
  module: 'Excel Loader',
  route: '/forms-safe-ride-import',
  instruction: 'Import SafeRide trips from Excel/CSV and validate errors before saving.'
}, {
  module: 'Full Shift Analysis',
  route: '/full-shift-analysis',
  instruction: 'Analyze the full shift by routes, times and productivity.'
}, {
  module: 'Office Settings',
  route: '/settings/office',
  instruction: 'Configure office data, contact info and operational parameters.'
}, {
  module: 'Preferences',
  route: '/preferences',
  instruction: 'Adjust interface behavior, tables and saved views.'
}, {
  module: 'Primary Dashboard',
  route: '/trip-analytics',
  instruction: 'Monitor key KPIs and trip volume by status.'
}, {
  module: 'Rates',
  route: '/rates',
  instruction: 'Manage rates by service type, trip type and conditions.'
}, {
  module: 'SMS Integrations',
  route: '/integrations/sms',
  instruction: 'Send manual/automatic messages and review delivery status.'
}, {
  module: 'System Logs',
  route: '/system-logs',
  instruction: 'Audit sessions, actions and active time per user.'
}, {
  module: 'System Messages',
  route: '/system-messages',
  instruction: 'Schedule internal alerts and track critical notifications.'
}, {
  module: 'Trip Dashboard',
  route: '/trip-dashboard',
  instruction: 'Build visual routes, select trips and control the map panel.'
}, {
  module: 'Uber Integrations',
  route: '/integrations/uber',
  instruction: 'Sync requests with Uber and validate provider response.'
}, {
  module: 'User Management',
  route: '/user-management',
  instruction: 'Create users, define roles, access levels and inactivity timeouts.'
}, {
  module: 'Vehicles',
  route: '/drivers/vehicles',
  instruction: 'Register vehicles, documents and capacity per unit.'
}].sort((a, b) => a.module.localeCompare(b.module, 'en', {
  sensitivity: 'base'
}));

const QUICK_FLOW = [{
  step: '1. Log in',
  detail: 'Sign in with your username or email and active password.'
}, {
  step: '2. Dispatcher',
  detail: 'Filter and select trips; validate the selected-trips count at the top.'
}, {
  step: '3. Route/Clear',
  detail: 'Build a route, clear selection or focus the map by city/ZIP.'
}, {
  step: '4. Confirmations',
  detail: 'Send confirmation SMS or custom messages as needed.'
}, {
  step: '5. Review logs',
  detail: 'Audit actions and team sessions in System Logs.'
}];

const HelpPage = () => {
  return <>
      <PageTitle title="Help" subName="Operations" />
      <Row className="g-3 mb-3">
        <Col md={6} xl={3}>
          <Card className="h-100">
            <CardBody>
              <p className="text-muted mb-2">Modules indexed</p>
              <h4 className="mb-0">{HELP_ENTRIES.length}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card className="h-100">
            <CardBody>
              <p className="text-muted mb-2">Quick flow steps</p>
              <h4 className="mb-0">{QUICK_FLOW.length}</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card className="h-100">
            <CardBody>
              <p className="text-muted mb-2">Core route</p>
              <h4 className="mb-0">Dispatcher</h4>
            </CardBody>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card className="h-100">
            <CardBody>
              <p className="text-muted mb-2">Status</p>
              <h4 className="mb-0">Ready</h4>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Card className="mb-3">
        <CardBody>
          <div className="d-flex flex-column flex-lg-row justify-content-between gap-3">
            <div>
              <h5 className="mb-1">Mapa completo de instrucciones</h5>
              <p className="text-muted mb-0">Indice alfabetico para ubicar cada modulo del sistema, que hace y donde abrirlo.</p>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <Button as={Link} href="/dispatcher" variant="primary">Open Dispatcher</Button>
              <Button as={Link} href="/system-logs" variant="outline-primary">Open System Logs</Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Row className="g-3 mb-3">
        <Col xl={5}>
          <Card className="h-100">
            <CardBody>
              <h5 className="mb-3">Flujo recomendado</h5>
              <div className="d-flex flex-column gap-2">
                {QUICK_FLOW.map(item => <div key={item.step} className="border rounded p-2">
                    <div className="fw-semibold">{item.step}</div>
                    <div className="small text-muted">{item.detail}</div>
                  </div>)}
              </div>
            </CardBody>
          </Card>
        </Col>
        <Col xl={7}>
          <Card className="h-100">
            <CardBody>
              <h5 className="mb-3">Atajos rapidos</h5>
              <div className="d-flex flex-wrap gap-2">
                <Badge bg="primary">A/U/C = Assign, Unassign, Cancel</Badge>
                <Badge bg="secondary">AL/BL/CL = filtro de leg</Badge>
                <Badge bg="info">A/W/STR = tipo de movilidad</Badge>
                <Badge bg="dark">Route = construir secuencia</Badge>
                <Badge bg="warning" text="dark">Clear = limpiar seleccion</Badge>
                <Badge bg="success">Selected trips = conteo actual</Badge>
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Card>
        <CardBody>
          <h5 className="mb-3">Indice alfabetico A-Z</h5>
          <div className="table-responsive">
            <Table className="table-centered align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th>Module</th>
                  <th>Instruction</th>
                  <th>Route</th>
                </tr>
              </thead>
              <tbody>
                {HELP_ENTRIES.map(entry => <tr key={entry.module}>
                    <td className="fw-semibold">{entry.module}</td>
                    <td>{entry.instruction}</td>
                    <td>
                      <Button as={Link} href={entry.route} variant="outline-secondary" size="sm">{entry.route}</Button>
                    </td>
                  </tr>)}
              </tbody>
            </Table>
          </div>
        </CardBody>
      </Card>
    </>;
};

export default HelpPage;