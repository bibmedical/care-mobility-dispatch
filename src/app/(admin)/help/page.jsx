import PageTitle from '@/components/PageTitle';
import Link from 'next/link';
import { Badge, Button, Card, CardBody, Col, Row, Table } from 'react-bootstrap';

export const metadata = {
  title: 'Help'
};

const HELP_ENTRIES = [{
  module: 'AI Integrations',
  route: '/integrations/ai',
  instruction: 'Configura proveedor, valida claves y prueba prompts operacionales.'
}, {
  module: 'Avatar',
  route: '/avatar',
  instruction: 'Administra perfil visual y datos rapidos del usuario activo.'
}, {
  module: 'Black List',
  route: '/blacklist',
  instruction: 'Revisa pasajeros bloqueados, razones y estado de restriccion.'
}, {
  module: 'Confirmation',
  route: '/confirmation',
  instruction: 'Dispara confirmaciones y verifica respuesta de pasajeros en cola.'
}, {
  module: 'Daily Driver Snapshot',
  route: '/daily-driver-snapshot',
  instruction: 'Consulta foto diaria de rendimiento por chofer y turnos.'
}, {
  module: 'Dispatcher',
  route: '/dispatcher',
  instruction: 'Asigna viajes, aplica filtros de mapa, y monitorea choferes en vivo.'
}, {
  module: 'Driver Efficiency Report',
  route: '/driver-efficiency-report',
  instruction: 'Mide eficiencia por bloque, tiempos muertos y cumplimiento.'
}, {
  module: 'Drivers',
  route: '/drivers',
  instruction: 'Edita choferes, licencias y estados de disponibilidad operativa.'
}, {
  module: 'Email Templates',
  route: '/settings/email-templates',
  instruction: 'Actualiza plantillas para alertas, vencimientos y mensajes automaticos.'
}, {
  module: 'Excel Loader',
  route: '/forms-safe-ride-import',
  instruction: 'Importa trips SafeRide por Excel/CSV y valida errores antes de guardar.'
}, {
  module: 'Full Shift Analysis',
  route: '/full-shift-analysis',
  instruction: 'Analiza jornada completa por rutas, tiempos y productividad.'
}, {
  module: 'Office Settings',
  route: '/settings/office',
  instruction: 'Configura datos de oficina, contacto y parametros de operacion.'
}, {
  module: 'Preferences',
  route: '/preferences',
  instruction: 'Ajusta comportamiento de interfaz, tablas y vistas guardadas.'
}, {
  module: 'Primary Dashboard',
  route: '/trip-analytics',
  instruction: 'Supervisa KPIs principales y volumen de viajes por estado.'
}, {
  module: 'Rates',
  route: '/rates',
  instruction: 'Gestiona tarifas por servicio, tipo de viaje y condiciones.'
}, {
  module: 'SMS Integrations',
  route: '/integrations/sms',
  instruction: 'Envia mensajes manuales/automaticos y revisa estado de entregas.'
}, {
  module: 'System Logs',
  route: '/system-logs',
  instruction: 'Audita sesiones, acciones y tiempo activo por usuario.'
}, {
  module: 'System Messages',
  route: '/system-messages',
  instruction: 'Programa alertas internas y seguimiento de notificaciones criticas.'
}, {
  module: 'Trip Dashboard',
  route: '/trip-dashboard',
  instruction: 'Arma rutas visuales, selecciona viajes y controla panel de mapa.'
}, {
  module: 'Uber Integrations',
  route: '/integrations/uber',
  instruction: 'Sincroniza solicitudes con Uber y valida respuesta del proveedor.'
}, {
  module: 'User Management',
  route: '/user-management',
  instruction: 'Crea usuarios, define roles, accesos y tiempos de inactividad.'
}, {
  module: 'Vehicles',
  route: '/drivers/vehicles',
  instruction: 'Registra vehiculos, documentos y capacidad por unidad.'
}].sort((a, b) => a.module.localeCompare(b.module, 'en', {
  sensitivity: 'base'
}));

const QUICK_FLOW = [{
  step: '1. Log in',
  detail: 'Entra con username o email y tu password activa.'
}, {
  step: '2. Dispatcher',
  detail: 'Filtra y selecciona viajes; valida conteo de selected trips arriba.'
}, {
  step: '3. Route/Clear',
  detail: 'Construye ruta, limpia seleccion o enfoca mapa por city/ZIP.'
}, {
  step: '4. Confirmations',
  detail: 'Envia SMS de confirmacion o mensajes custom segun necesidad.'
}, {
  step: '5. Review logs',
  detail: 'Audita en System Logs las acciones y sesiones del equipo.'
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