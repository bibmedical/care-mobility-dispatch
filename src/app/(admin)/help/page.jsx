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

      <Card className="mb-3">
        <CardBody>
          <h5 className="mb-3">Changelog — Version History</h5>
          <div className="d-flex flex-column gap-3">

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="warning" text="dark" className="fs-6 px-3 py-2">V8</Badge>
                <span className="fw-semibold text-dark">Dispatcher &amp; Trip Dashboard — Workflow Separation + Custom Toolbar Builder</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>April 1, 2026 — Latest</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Fixed local-vs-server sync race: local dispatch mutations (delete route, unassign, etc.) now persist correctly without being reverted by stale server snapshots.</li>
                <li>Trip Dashboard and Dispatcher selections are now workspace-local (selected trips/driver/route no longer leak from one screen to the other).</li>
                <li>Default date behavior split by workspace: Trip Dashboard opens with no selected date, Dispatcher opens on current day.</li>
                <li>Trip Dashboard with no date selected now shows no trips/routes (prevents old-day records from appearing unexpectedly).</li>
                <li>Columns picker popover repositioned to avoid clipping off-screen on the right.</li>
                <li>Trip Dashboard header cleanup: removed extra trip/driver/live badges, changed label VDRS → Drivers, added driver search input in drivers panel.</li>
                <li>Selected-count indicator moved from top bar into table header (shows numeric value only).</li>
                <li>Color action groups (A/A2/U/C, Leg, Type) moved to top toolbar row per operator request.</li>
                <li>New toolbar customization mode in Trip Dashboard and Dispatcher: Edit, drag blocks, Save, and Reset.</li>
                <li>Toolbar customization now works across rows (move blocks between row 1/2/3) via drag-and-drop, and removed temporary 1/2/3 move buttons.</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="primary" className="fs-6 px-3 py-2">V7</Badge>
                <span className="fw-semibold text-dark">Trip Dashboard — Flexible Docking Layouts</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>March 31, 2026 — Evening</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>3 layout modes: <strong>Normal</strong>, <strong>Focus Right</strong> (map-focused right column), <strong>Stacked</strong> (panels stacked vertically)</li>
                <li>Focus Right keeps the map emphasized inside the workspace without opening a separate window</li>
                <li>Panel visibility controls: Both / VDRS / Routes / Hide bottom panels</li>
                <li>Swap button to reverse VDRS ↔ Routes panel order</li>
                <li>Restore button — one click returns to Normal layout</li>
                <li>Layout preference, panel view, and panel order all saved to localStorage and restored on next visit</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="success" className="fs-6 px-3 py-2">V6</Badge>
                <span className="fw-semibold text-dark">Scrollbar &amp; WillCall Polish</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>March 31, 2026 — PM</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Top horizontal scrollbar now visible in Dispatcher <strong>and</strong> Trip Dashboard (forced +40px overflow so Chrome always shows scroll thumb)</li>
                <li>ScrollWidth measured via ResizeObserver on actual table element — no more stale width</li>
                <li>WillCall (WC) button now only appears on non-AL (non-outbound) trip legs in Dispatcher</li>
                <li>Improved <code>getTripLegFilterKey</code> — reads <code>trip.leg / tripLeg / legCode</code> (A/B/C/D) before falling back to legLabel text parsing</li>
                <li>Confirmation "Detected max miles" badge off by default — toggle checkbox to enable</li>
                <li>Pickup times in Confirmation now show readable AM/PM instead of Excel serial numbers</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="primary" className="fs-6 px-3 py-2">V5</Badge>
                <span className="fw-semibold text-dark">Dispatcher &amp; Dashboard UI Polish</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>March 31, 2026 — Mid Morning</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Synced dual top/bottom horizontal scrollbar added to Dispatcher and Trip Dashboard</li>
                <li>Draggable grey column resizers on dispatch tables</li>
                <li>Long address columns clamped to two lines to save vertical space</li>
                <li>PU/DO ZIP columns added to dispatch table</li>
                <li>Rider name stacking improved; table forced to <code>max-content</code> width for horizontal scroll</li>
                <li>Miles range selectors fixed — avoids hidden min=0 and preserves correct bounds</li>
                <li>Confirmation time window supports spreadsheet numeric pickup times</li>
                <li>Confirmation selection synced with visible filtered trips</li>
                <li>Auto-detect max miles (cap 25) and deduplication in Confirmation</li>
                <li>Patient exclusion rules: one-day / range / always</li>
                <li>Leg scope controls (A/B) for confirmation and cancellation</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="info" className="fs-6 px-3 py-2">V4</Badge>
                <span className="fw-semibold text-dark">Confirmation Workspace — Full Feature Build</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>March 31, 2026 — Morning</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Date/time filtering, manual confirmation, cancel with note, and PDF export</li>
                <li>Hospital/Rehab status — exclude trips until expiration date</li>
                <li>SMS/WhatsApp confirmation method selection with batch sending</li>
                <li>WillCall status: red badge, toggle button, driver WhatsApp notification</li>
                <li>Trip update workflow: call / SMS / WhatsApp, schedule NEW marker, rider notes</li>
                <li>Patient history with date range search and confirmation analytics</li>
                <li>Mileage filter with auto-detected default (2AM–8AM window, max 25 mi)</li>
                <li>Theme toggle moved from Dispatcher toolbar to Settings only</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="warning" text="dark" className="fs-6 px-3 py-2">V3</Badge>
                <span className="fw-semibold text-dark">Communications + Translations</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>March 31, 2026 — Early Morning</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Communication extensions: WhatsApp, Telegram, Viber, Signal, SMS — server API route + modal UI</li>
                <li>Auto-link driver phone numbers to WhatsApp with quick message buttons</li>
                <li>Additional driver document fields: 1099, 3× Training Certificates</li>
                <li>Full UI translated from Spanish to English; AI bot context updated</li>
                <li>License check shows days remaining per driver with expiration alert wording</li>
                <li>Local file proxy for driver documents</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="danger" className="fs-6 px-3 py-2">V2</Badge>
                <span className="fw-semibold text-dark">Security Advanced + System Logs + 2FA</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>March 30, 2026 — Evening / Night</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>2FA (TOTP) for admin users with login verification flow</li>
                <li>Login lockout UX — blocks account after repeated failures</li>
                <li>Email-based passwordless login with verification codes</li>
                <li>Configurable inactivity timeout + auto-logout on web sessions</li>
                <li>Login failure logging system with admin API endpoint</li>
                <li>IP binding and 15-minute session hardening</li>
                <li>Full System Logs workspace: login/logout tracking, audit per user</li>
                <li>Lock entire dispatch panel when locked — overlay disables all controls</li>
                <li>Toolbar reorganized into 3 rows; A/U/C buttons moved to bottom panel</li>
                <li>ZIP/City filters, Column picker fix, draggable grey divider for column resize</li>
              </ul>
            </div>

            <div className="border rounded p-3" style={{ backgroundColor: '#f8f9fb', borderColor: '#d5deea' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="secondary" className="fs-6 px-3 py-2">V1</Badge>
                <span className="fw-semibold text-dark">Security Foundation + Auth Hardening</span>
                <span className="text-dark small ms-auto" style={{ opacity: 0.85 }}>March 30, 2026 — Afternoon</span>
              </div>
              <ul className="mb-0 small ps-3" style={{ color: '#334155' }}>
                <li>Require authentication on all routes; admin role required for write APIs</li>
                <li>Strengthen login validation — prevent empty credential bypass</li>
                <li>Remove "Remember me" checkbox from login</li>
                <li>Stabilize dispatch assistant mic/transcript controls</li>
                <li>Updated company logo asset + sidebar logo toggle placement</li>
                <li>User admin delete rules and improved local dispatch assistant</li>
              </ul>
            </div>

          </div>
        </CardBody>
      </Card>

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
