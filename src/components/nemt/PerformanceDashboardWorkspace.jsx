'use client';

import PageTitle from '@/components/PageTitle';
import { useLayoutContext } from '@/context/useLayoutContext';
import { getDocumentAlerts, isDriverOnline } from '@/helpers/nemt-admin-model';
import { formatMinutesAsHours, getTripBillingAmount, getTripServiceMinutes, isTripBillable } from '@/helpers/nemt-billing';
import useNemtAdminApi from '@/hooks/useNemtAdminApi';
import { useNemtContext } from '@/context/useNemtContext';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
import Link from 'next/link';
import React, { useMemo } from 'react';
import { Badge, Card, CardBody, Col, ProgressBar, Row, Spinner, Table } from 'react-bootstrap';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const percentFormatter = value => `${Math.round(value)}%`;

const buildPanelStyles = isLight => ({
  page: {
    color: isLight ? '#0f172a' : '#e6ecff'
  },
  panel: {
    background: isLight ? 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)' : 'linear-gradient(180deg, #171b27 0%, #121722 100%)',
    border: `1px solid ${isLight ? '#d5deea' : '#232c40'}`,
    boxShadow: isLight ? '0 12px 30px rgba(15, 23, 42, 0.08)' : '0 12px 40px rgba(5, 9, 18, 0.28)'
  },
  topStat: {
    background: isLight ? 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)' : 'linear-gradient(180deg, rgba(26,31,47,0.96) 0%, rgba(19,24,37,0.96) 100%)',
    border: `1px solid ${isLight ? '#d5deea' : '#232c40'}`,
    borderRadius: 16,
    padding: 18,
    height: '100%'
  },
  chartShell: {
    height: 260,
    display: 'flex',
    alignItems: 'flex-end',
    gap: 14,
    paddingTop: 22
  },
  chartBarWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    alignItems: 'stretch'
  },
  chartTrack: {
    borderRadius: 16,
    backgroundColor: isLight ? '#f8fbff' : '#0f1522',
    border: `1px solid ${isLight ? '#d5deea' : '#222b41'}`,
    height: 180,
    padding: 8,
    display: 'flex',
    alignItems: 'flex-end'
  },
  chartBar: {
    width: '100%',
    borderRadius: 12,
    background: 'linear-gradient(180deg, #3ad59f 0%, #178f63 100%)'
  },
  chartBarSecondary: {
    width: '100%',
    borderRadius: 12,
    background: 'linear-gradient(180deg, #7d82ff 0%, #5560ff 100%)'
  },
  donutTrack: {
    width: 220,
    height: 220,
    borderRadius: '50%',
    margin: '0 auto',
    position: 'relative'
  },
  donutCenter: {
    position: 'absolute',
    inset: 28,
    borderRadius: '50%',
    backgroundColor: isLight ? '#ffffff' : '#171b27',
    border: `1px solid ${isLight ? '#d5deea' : '#232c40'}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column'
  },
  miniMetric: {
    backgroundColor: isLight ? '#f8fbff' : '#101521',
    border: `1px solid ${isLight ? '#d5deea' : '#232c40'}`,
    borderRadius: 14,
    padding: 14
  }
});

const buildStatusMetrics = trips => {
  const counts = {
    completed: 0,
    canceled: 0,
    assigned: 0,
    inProgress: 0,
    unassigned: 0
  };

  trips.forEach(trip => {
    const status = String(trip.status ?? '').toLowerCase();
    if (status === 'completed') counts.completed += 1;
    else if (status === 'canceled' || status === 'cancelled') counts.canceled += 1;
    else if (status === 'assigned') counts.assigned += 1;
    else if (status === 'in progress') counts.inProgress += 1;
    else counts.unassigned += 1;
  });

  return counts;
};

const PerformanceDashboardWorkspace = () => {
  const { themeMode } = useLayoutContext();
  const panelStyles = useMemo(() => buildPanelStyles(themeMode === 'light'), [themeMode]);
  const { data, loading } = useNemtAdminApi();
  const { drivers: dispatchDrivers, trips, routePlans } = useNemtContext();

  const analytics = useMemo(() => {
    const adminDrivers = data?.drivers ?? [];
    const vehicles = data?.vehicles ?? [];
    const groupings = data?.groupings ?? [];
    const driverAlerts = adminDrivers.map(driver => ({
      id: driver.id,
      name: `${driver.firstName} ${driver.lastName}`.trim(),
      alerts: getDocumentAlerts(driver)
    })).filter(item => item.alerts.length > 0);
    const counts = buildStatusMetrics(trips);
    const onlineDrivers = adminDrivers.filter(isDriverOnline).length;
    const billableTrips = trips.filter(isTripBillable);
    const completedRevenue = billableTrips.filter(trip => String(trip.status).toLowerCase() === 'completed').reduce((sum, trip) => sum + getTripBillingAmount(trip), 0);
    const assignedRevenue = billableTrips.filter(trip => ['assigned', 'in progress', 'completed'].includes(String(trip.status).toLowerCase())).reduce((sum, trip) => sum + getTripBillingAmount(trip), 0);
    const projectedRevenue = assignedRevenue;
    const utilization = vehicles.length > 0 ? adminDrivers.filter(driver => driver.vehicleId).length / vehicles.length * 100 : 0;
    const complianceRate = adminDrivers.length > 0 ? (adminDrivers.length - driverAlerts.length) / adminDrivers.length * 100 : 100;
    const cancellationRate = trips.length > 0 ? counts.canceled / trips.length * 100 : 0;
    const avgTripsPerDriver = adminDrivers.length > 0 ? (counts.completed + counts.assigned + counts.inProgress) / adminDrivers.length : 0;
    const readyDrivers = adminDrivers.filter(driver => driver.groupingId === groupings.find(group => group.name === 'Dispatch Ready')?.id).length;

    const leaderboard = adminDrivers.map(driver => {
      const driverTrips = trips.filter(trip => trip.driverId === driver.id);
      const completed = driverTrips.filter(trip => String(trip.status).toLowerCase() === 'completed').length;
      const activeTrips = driverTrips.filter(trip => ['assigned', 'in progress'].includes(String(trip.status).toLowerCase())).length;
      const canceled = driverTrips.filter(trip => ['canceled', 'cancelled'].includes(String(trip.status).toLowerCase())).length;
      const revenue = driverTrips.reduce((sum, trip) => sum + getTripBillingAmount(trip), 0);
      const serviceMinutes = driverTrips.reduce((sum, trip) => sum + getTripServiceMinutes(trip), 0);
      return {
        id: driver.id,
        name: `${driver.firstName} ${driver.lastName}`.trim(),
        vehicle: vehicles.find(vehicle => vehicle.id === driver.vehicleId)?.label || 'No vehicle',
        completed,
        activeTrips,
        canceled,
        revenue,
        serviceMinutes,
        alerts: getDocumentAlerts(driver).length,
        score: completed * 12 + revenue / 10 - canceled * 8 - getDocumentAlerts(driver).length * 6
      };
    }).sort((left, right) => right.score - left.score).slice(0, 6);

    const monthlyProjection = [{ month: 'Apr', value: 0, secondary: 0 }, { month: 'May', value: 0, secondary: 0 }, { month: 'Jun', value: 0, secondary: 0 }, { month: 'Jul', value: Math.round(projectedRevenue), secondary: Math.round(completedRevenue) }];

    const activity = [{
      label: 'Open Dispatcher',
      href: '/dispatcher',
      detail: `${dispatchDrivers.length} drivers synced`
    }, {
      label: 'Open Drivers',
      href: '/drivers',
      detail: `${driverAlerts.length} compliance items`
    }, {
      label: 'Open Trip Dashboard',
      href: '/trip-dashboard',
      detail: `${routePlans.length} active routes`
    }];

    return {
      counts,
      adminDrivers,
      vehicles,
      routePlans,
      completedRevenue,
      projectedRevenue,
      assignedRevenue,
      utilization,
      complianceRate,
      cancellationRate,
      avgTripsPerDriver,
      leaderboard,
      driverAlerts,
      monthlyProjection,
      activity,
      onlineDrivers,
      readyDrivers,
      billableTripCount: billableTrips.length
    };
  }, [data, dispatchDrivers, routePlans, trips]);

  const donutCompleted = analytics.counts.completed;
  const donutCanceled = analytics.counts.canceled;
  const donutAssigned = analytics.counts.assigned + analytics.counts.inProgress;
  const donutTotal = Math.max(1, donutCompleted + donutCanceled + donutAssigned);
  const completedAngle = donutCompleted / donutTotal * 360;
  const canceledAngle = donutCanceled / donutTotal * 360;
  const donutStyle = {
    ...panelStyles.donutTrack,
    background: `conic-gradient(#7d82ff 0deg ${completedAngle}deg, #21b8ff ${completedAngle}deg ${completedAngle + canceledAngle}deg, #ffb04d ${completedAngle + canceledAngle}deg 360deg)`
  };

  return <div style={panelStyles.page}>
      <PageTitle title="Primary Dashboard" subName="Performance" />

      <Row className="g-3 mb-3">
        {[{
          label: 'Drivers Ready',
          value: analytics.readyDrivers,
          detail: `${analytics.onlineDrivers} online from Android`,
          accent: '#7d82ff',
          icon: 'iconoir:user'
        }, {
          label: 'Trips Completed',
          value: analytics.counts.completed,
          detail: `${analytics.counts.assigned + analytics.counts.inProgress} active or assigned`,
          accent: '#1fd19b',
          icon: 'iconoir:check-circle'
        }, {
          label: 'Canceled Trips',
          value: analytics.counts.canceled,
          detail: `${percentFormatter(analytics.cancellationRate)} cancellation rate`,
          accent: '#ff7b72',
          icon: 'iconoir:cancel'
        }, {
          label: 'Projected Revenue',
          value: currencyFormatter.format(analytics.projectedRevenue),
          detail: `${analytics.billableTripCount} billable trips`,
          accent: '#ffb04d',
          icon: 'iconoir:dollar-circle'
        }].map(card => <Col md={6} xl={3} key={card.label}><div style={panelStyles.topStat}><div className="d-flex justify-content-between align-items-start gap-3"><div><div className="small text-secondary mb-2">{card.label}</div><div className="h3 mb-1 text-white">{card.value}</div><div className="small" style={{ color: card.accent }}>{card.detail}</div></div><div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: 44, height: 44, backgroundColor: `${card.accent}22`, color: card.accent }}><IconifyIcon icon={card.icon} className="fs-22" /></div></div></div></Col>)}
      </Row>

      <Row className="g-3">
        <Col xl={9}>
          <Card style={panelStyles.panel}>
            <CardBody>
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                <div>
                  <h5 className="mb-1 text-white">Performance Overview</h5>
                  <div className="small text-secondary">Pagina primaria conectada a choferes, viajes y billing real del sistema.</div>
                </div>
                <Badge bg="dark" className="border border-secondary-subtle">This Month</Badge>
              </div>
              {loading ? <div className="py-5 text-center text-secondary"><Spinner animation="border" size="sm" className="me-2" />Loading analytics...</div> : <>
                  <div style={panelStyles.chartShell}>
                    {analytics.monthlyProjection.map(item => {
                      const maxValue = Math.max(...analytics.monthlyProjection.map(entry => entry.value), 1);
                      return <div style={panelStyles.chartBarWrap} key={item.month}><div className="small text-secondary text-center">{currencyFormatter.format(item.value)}</div><div style={panelStyles.chartTrack}><div className="w-100 d-flex align-items-end gap-2 h-100"><div style={{ ...panelStyles.chartBarSecondary, height: `${item.secondary / maxValue * 100}%`, opacity: 0.8 }} /><div style={{ ...panelStyles.chartBar, height: `${item.value / maxValue * 100}%` }} /></div></div><div className="small text-center text-secondary">{item.month}</div></div>;
                    })}
                  </div>
                  <Row className="g-3 mt-1">
                    <Col md={3}><div style={panelStyles.miniMetric}><div className="small text-secondary">Fleet Utilization</div><div className="h4 mb-1 text-white">{percentFormatter(analytics.utilization)}</div><ProgressBar now={analytics.utilization} variant="success" style={{ height: 8, backgroundColor: '#0d1421' }} /></div></Col>
                    <Col md={3}><div style={panelStyles.miniMetric}><div className="small text-secondary">Compliance Rate</div><div className="h4 mb-1 text-white">{percentFormatter(analytics.complianceRate)}</div><ProgressBar now={analytics.complianceRate} variant="info" style={{ height: 8, backgroundColor: '#0d1421' }} /></div></Col>
                    <Col md={3}><div style={panelStyles.miniMetric}><div className="small text-secondary">Avg Trips / Driver</div><div className="h4 mb-1 text-white">{analytics.avgTripsPerDriver.toFixed(1)}</div><div className="small text-secondary">Completed + active workload</div></div></Col>
                    <Col md={3}><div style={panelStyles.miniMetric}><div className="small text-secondary">Routes Saved</div><div className="h4 mb-1 text-white">{analytics.routePlans.length}</div><div className="small text-secondary">Dispatch plans created</div></div></Col>
                  </Row>
                </>}
            </CardBody>
          </Card>
        </Col>

        <Col xl={3}>
          <Card style={panelStyles.panel} className="h-100">
            <CardBody>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0 text-white">Trip Mix</h5>
                <Badge bg="dark" className="border border-secondary-subtle">All</Badge>
              </div>
              <div style={donutStyle}>
                <div style={panelStyles.donutCenter}>
                  <div className="small text-secondary">Trips tracked</div>
                  <div className="h3 mb-0 text-white">{trips.length}</div>
                </div>
              </div>
              <div className="d-flex justify-content-center gap-3 mt-3 flex-wrap small">
                <span className="text-secondary"><span className="me-1" style={{ color: '#7d82ff' }}>●</span>Completed {donutCompleted}</span>
                <span className="text-secondary"><span className="me-1" style={{ color: '#21b8ff' }}>●</span>Canceled {donutCanceled}</span>
                <span className="text-secondary"><span className="me-1" style={{ color: '#ffb04d' }}>●</span>Active {donutAssigned}</span>
              </div>
              <div className="mt-4 small text-secondary text-center">Las metricas de billing quedan en 0 hasta que empieces a marcar trips o rutas en billing.</div>
            </CardBody>
          </Card>
        </Col>

        <Col xl={7}>
          <Card style={panelStyles.panel}>
            <CardBody>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0 text-white">Driver Performance</h5>
                <Link href="/drivers" className="small text-decoration-none">Open Drivers</Link>
              </div>
              <div className="table-responsive">
                <Table className="align-middle mb-0 text-white">
                  <thead>
                    <tr className="text-secondary small">
                      <th>Driver</th>
                      <th>Vehicle</th>
                      <th>Completed</th>
                      <th>Hours</th>
                      <th>Active Trips</th>
                      <th>Alerts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.leaderboard.length > 0 ? analytics.leaderboard.map(item => <tr key={item.id}><td><div className="fw-semibold">{item.name}</div></td><td>{item.vehicle}</td><td>{item.completed}</td><td>{formatMinutesAsHours(item.serviceMinutes)}</td><td>{item.activeTrips}</td><td>{item.alerts > 0 ? <Badge bg="warning" text="dark">{item.alerts}</Badge> : <Badge bg="success">0</Badge>}</td></tr>) : <tr><td colSpan={6} className="text-center text-secondary py-4">No driver performance yet. Load trips to start hours and trip counts.</td></tr>}
                  </tbody>
                </Table>
              </div>
            </CardBody>
          </Card>
        </Col>

        <Col xl={5}>
          <Card style={panelStyles.panel}>
            <CardBody>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0 text-white">Financial Snapshot</h5>
                <Badge bg="dark" className="border border-secondary-subtle">Live</Badge>
              </div>
              <Row className="g-3 mb-3">
                <Col sm={6}><div style={panelStyles.miniMetric}><div className="small text-secondary">Revenue Captured</div><div className="h4 mb-1 text-white">{currencyFormatter.format(analytics.completedRevenue)}</div><div className="small text-secondary">Completed trips only</div></div></Col>
                <Col sm={6}><div style={panelStyles.miniMetric}><div className="small text-secondary">Pipeline Revenue</div><div className="h4 mb-1 text-white">{currencyFormatter.format(analytics.assignedRevenue)}</div><div className="small text-secondary">Assigned and completed</div></div></Col>
                <Col sm={6}><div style={panelStyles.miniMetric}><div className="small text-secondary">Projected Revenue</div><div className="h4 mb-1 text-white">{currencyFormatter.format(analytics.projectedRevenue)}</div><div className="small text-secondary">Real billable trips only</div></div></Col>
                <Col sm={6}><div style={panelStyles.miniMetric}><div className="small text-secondary">Fleet Units</div><div className="h4 mb-1 text-white">{analytics.vehicles.length}</div><div className="small text-secondary">Cars available in system</div></div></Col>
              </Row>
              <div className="small text-secondary">Revenue now stays at 0 until a trip is really billable or has captured revenue. No fallback money is injected anymore.</div>
            </CardBody>
          </Card>
        </Col>

        <Col xl={6}>
          <Card style={panelStyles.panel}>
            <CardBody>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0 text-white">Compliance Alerts</h5>
                <Link href="/drivers" className="small text-decoration-none">Resolve</Link>
              </div>
              <div className="d-flex flex-column gap-3">
                {analytics.driverAlerts.length > 0 ? analytics.driverAlerts.slice(0, 6).map(item => <div key={item.id} className="d-flex justify-content-between align-items-start gap-3 p-3 rounded-3" style={{ backgroundColor: themeMode === 'light' ? '#f8fbff' : '#101521', border: `1px solid ${themeMode === 'light' ? '#d5deea' : '#232c40'}` }}><div><div className="fw-semibold text-white">{item.name}</div><div className="small text-secondary">{item.alerts[0]?.text}</div></div><Badge bg={item.alerts[0]?.severity === 'danger' ? 'danger' : 'warning'}>{item.alerts.length} alert{item.alerts.length === 1 ? '' : 's'}</Badge></div>) : <div className="text-secondary small">No compliance alerts right now.</div>}
              </div>
            </CardBody>
          </Card>
        </Col>

        <Col xl={6}>
          <Card style={panelStyles.panel}>
            <CardBody>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0 text-white">Quick Actions</h5>
                <Badge bg="dark" className="border border-secondary-subtle">Operations</Badge>
              </div>
              <div className="d-flex flex-column gap-3">
                {analytics.activity.map(item => <Link key={item.label} href={item.href} className="text-decoration-none"><div className="d-flex justify-content-between align-items-center gap-3 p-3 rounded-3" style={{ backgroundColor: themeMode === 'light' ? '#f8fbff' : '#101521', border: `1px solid ${themeMode === 'light' ? '#d5deea' : '#232c40'}` }}><div><div className="fw-semibold text-white">{item.label}</div><div className="small text-secondary">{item.detail}</div></div><IconifyIcon icon="iconoir:nav-arrow-right" className="text-secondary" /></div></Link>)}
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>;
};

export default PerformanceDashboardWorkspace;