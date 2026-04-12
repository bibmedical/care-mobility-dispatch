'use client';

import PageTitle from '@/components/PageTitle';
import { useNemtContext } from '@/context/useNemtContext';
import { getTripServiceDateKey, parseTripClockMinutes } from '@/helpers/nemt-dispatch-state';
import { buildEarlyMorningRideReportDocument, getTripPhoneDisplay, getTripRideIdDisplay, PRINT_TEMPLATE_OPTIONS } from '@/helpers/nemt-print-setup';
import Link from 'next/link';
import React, { useMemo, useState } from 'react';
import { Badge, Button, Card, CardBody, Col, Form, Row, Table } from 'react-bootstrap';

const templateColumns = {
  'ride-id-office': ['Ride ID', 'PU', 'DO', 'Rider', 'Phone', 'Miles', 'PU Address', 'DO Address'],
  'ride-id-compact': ['Ride ID', 'PU', 'DO', 'Miles', 'Rider'],
  'ride-id-manifest': ['Ride ID', 'Type', 'PU', 'DO', 'Miles', 'Rider', 'Phone', 'PU Address', 'DO Address']
};

const getTomorrowDateKey = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const PrintSetupWorkspace = () => {
  const { uiPreferences, setPrintSetup, trips = [] } = useNemtContext();
  const [message, setMessage] = useState('Listo para configurar tu template de impresion.');
  const [reportDate, setReportDate] = useState(getTomorrowDateKey());
  const selectedTemplate = uiPreferences?.printSetup?.template || 'ride-id-office';
  const selectedOption = useMemo(() => PRINT_TEMPLATE_OPTIONS.find(option => option.id === selectedTemplate) || PRINT_TEMPLATE_OPTIONS[0], [selectedTemplate]);

  const earlyMorningTrips = useMemo(() => {
    return [...trips].filter(trip => getTripServiceDateKey(trip) === reportDate).filter(trip => {
      const rideId = getTripRideIdDisplay(trip);
      return String(rideId || '').trim().startsWith('4');
    }).filter(trip => {
      const pickupMinutes = parseTripClockMinutes(trip?.scheduledPickup || trip?.pickup);
      return pickupMinutes != null && pickupMinutes >= 120 && pickupMinutes <= 480;
    }).sort((leftTrip, rightTrip) => {
      const leftPickup = parseTripClockMinutes(leftTrip?.scheduledPickup || leftTrip?.pickup) ?? Number.MAX_SAFE_INTEGER;
      const rightPickup = parseTripClockMinutes(rightTrip?.scheduledPickup || rightTrip?.pickup) ?? Number.MAX_SAFE_INTEGER;
      if (leftPickup !== rightPickup) return leftPickup - rightPickup;
      return String(leftTrip?.rider || '').localeCompare(String(rightTrip?.rider || ''));
    });
  }, [reportDate, trips]);

  const handlePrintEarlyMorningReport = () => {
    if (earlyMorningTrips.length === 0) {
      setMessage('No trips found between 2:00 AM and 8:00 AM with a Ride ID starting with 4 for that day.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=1200,height=780');
    if (!printWindow) {
      setMessage('No se pudo abrir la ventana de impresion.');
      return;
    }

    printWindow.document.write(buildEarlyMorningRideReportDocument({
      reportTitle: 'Early Morning Ride Report',
      selectedDate: reportDate,
      generatedAt: new Date().toLocaleString(),
      trips: earlyMorningTrips
    }));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    setMessage(`Imprimiendo reporte de madrugada para ${reportDate}.`);
  };

  const handleTemplateChange = event => {
    const nextTemplate = event.target.value;
    setPrintSetup({ template: nextTemplate });
    const templateLabel = PRINT_TEMPLATE_OPTIONS.find(option => option.id === nextTemplate)?.label || 'template';
    setMessage(`Template guardado: ${templateLabel}.`);
  };

  return <>
      <PageTitle title="Print Setup" subName="Settings / Office" />
      <Row className="g-3">
        <Col xl={8}>
          <Card>
            <CardBody>
              <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
                <div>
                  <h4 className="mb-1">Template de impresion</h4>
                  <p className="text-muted mb-0">Escoge el formato que quieres usar cuando le des a Print Route. El sistema lo guarda como preferencia de oficina.</p>
                </div>
                <Badge bg="primary">Activo: {selectedOption.label}</Badge>
              </div>

              <Form.Group>
                <Form.Label className="fw-semibold">Template</Form.Label>
                <Form.Select value={selectedTemplate} onChange={handleTemplateChange}>
                  {PRINT_TEMPLATE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </Form.Select>
              </Form.Group>

              <div className="small text-muted mt-2">{selectedOption.description}</div>
              <div className="small mt-3">{message}</div>

              <div className="mt-4">
                <div className="fw-semibold mb-2">Columnas del template</div>
                <div className="d-flex gap-2 flex-wrap">
                  {(templateColumns[selectedTemplate] || []).map(column => <Badge bg="light" text="dark" key={column}>{column}</Badge>)}
                </div>
              </div>
            </CardBody>
          </Card>

          <Card className="mt-3">
            <CardBody>
              <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
                <div>
                  <h4 className="mb-1">Reporte 2:00 AM a 8:00 AM</h4>
                  <p className="text-muted mb-0">Escoge el dia y te lee del sistema los viajes cuyo Ride ID empieza con 4, con Trip ID, telefono, direcciones y nombre del paciente.</p>
                </div>
                <Badge bg="dark">{earlyMorningTrips.length} viajes</Badge>
              </div>

              <div className="d-flex gap-2 flex-wrap align-items-end mb-3">
                <Form.Group>
                  <Form.Label className="fw-semibold">Dia de la ruta</Form.Label>
                  <Form.Control type="date" value={reportDate} onChange={event => setReportDate(event.target.value)} style={{ width: 180 }} />
                </Form.Group>
                <Button variant="primary" onClick={handlePrintEarlyMorningReport}>Print 2AM-8AM</Button>
              </div>

              <div className="small text-muted mb-3">Orden: desde las 2:00 AM hacia arriba, y si chocan en hora los ordena alfabeticamente por paciente.</div>

              <div className="table-responsive">
                <Table hover size="sm" className="align-middle mb-0">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Ride ID</th>
                      <th>Trip ID</th>
                      <th>PU</th>
                      <th>DO</th>
                      <th>Paciente</th>
                      <th>Telefono</th>
                      <th>Miles</th>
                      <th>PU Address</th>
                      <th>DO Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {earlyMorningTrips.length === 0 ? <tr>
                        <td colSpan={10} className="text-muted text-center py-4">No hay viajes para ese dia con Ride ID que empiece con 4 entre 2:00 AM y 8:00 AM.</td>
                      </tr> : earlyMorningTrips.map((trip, index) => <tr key={trip.id}>
                        <td>{index + 1}</td>
                        <td>{getTripRideIdDisplay(trip) || '-'}</td>
                        <td>{trip.id || '-'}</td>
                        <td>{trip.pickup || '-'}</td>
                        <td>{trip.dropoff || '-'}</td>
                        <td>{trip.rider || '-'}</td>
                        <td>{getTripPhoneDisplay(trip)}</td>
                        <td>{Number.isFinite(Number(trip?.miles)) ? Number(trip.miles).toFixed(2) : '-'}</td>
                        <td>{trip.address || '-'}</td>
                        <td>{trip.destination || '-'}</td>
                      </tr>)}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>
        </Col>

        <Col xl={4}>
          <Card className="h-100">
            <CardBody className="d-flex flex-column gap-3">
              <div>
                <h5 className="mb-1">Lo que queda fijo</h5>
                <div className="text-muted small">Todos los templates de oficina dejan Ride ID, horarios y millas. Cambia el resto segun como quieras imprimir.</div>
              </div>
              <div>
                <h6 className="mb-2">Accesos rapidos</h6>
                <div className="d-flex gap-2 flex-wrap">
                  <Link href="/trip-dashboard" className="btn btn-primary btn-sm">Abrir Trip Dashboard</Link>
                  <Link href="/dispatcher" className="btn btn-outline-secondary btn-sm">Abrir Dispatcher</Link>
                </div>
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </>;
};

export default PrintSetupWorkspace;