'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, Col, Form, Row, Table } from 'react-bootstrap';
import { useSession } from 'next-auth/react';
import { useNemtContext } from '@/context/useNemtContext';
import { getTripBillingAmount } from '@/helpers/nemt-billing';
import { getTripServiceDateKey, isTripAssignedToDriver } from '@/helpers/nemt-dispatch-state';

const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);

const getTripTypeCode = trip => {
  const source = `${trip?.los || ''} ${trip?.vehicleType || ''} ${trip?.assistanceNeeds || ''} ${trip?.tripType || ''}`.toLowerCase();
  if (source.includes('stretcher') || source.includes('str')) return 'STR';
  if (source.includes('wheelchair') || source.includes('wheel') || source.includes('wc') || source.includes('w/c')) return 'W';
  return 'A';
};

const formatTodayDate = () => new Date().toISOString().slice(0, 10);

const ALLOWED_UNLOCK_STORAGE_KEY = userId => `__CARE_MOBILITY_GENIUS_UNLOCKED__${userId}`;

const GeniusWorkspace = () => {
  const { data: session } = useSession();
  const { trips, drivers, routePlans } = useNemtContext();
  const userId = String(session?.user?.id || '').trim();
  const [code, setCode] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [selectedDate, setSelectedDate] = useState('all');
  const [selectedDriverId, setSelectedDriverId] = useState('all');
  const [onlyAssigned, setOnlyAssigned] = useState(false);
  const [fuelReceipts, setFuelReceipts] = useState([]);
  const [payoutReceipts, setPayoutReceipts] = useState([]);
  const [loadingFuelReceipts, setLoadingFuelReceipts] = useState(false);
  const [loadingPayoutReceipts, setLoadingPayoutReceipts] = useState(false);
  const [fuelReceiptError, setFuelReceiptError] = useState('');
  const [fuelReceiptSuccess, setFuelReceiptSuccess] = useState('');
  const [payoutError, setPayoutError] = useState('');
  const [payoutSuccess, setPayoutSuccess] = useState('');
  const [submittingFuelReceipt, setSubmittingFuelReceipt] = useState(false);
  const [creatingPayout, setCreatingPayout] = useState(false);
  const [sendingPayoutEmailId, setSendingPayoutEmailId] = useState('');
  const [fuelReceiptForm, setFuelReceiptForm] = useState({
    driverId: '',
    serviceDate: formatTodayDate(),
    amount: '',
    gallons: '',
    receiptReference: '',
    receiptImageUrl: '',
    notes: ''
  });
  const [isUnlocked, setIsUnlocked] = useState(() => {
    if (typeof window === 'undefined' || !userId) return false;
    return window.sessionStorage.getItem(ALLOWED_UNLOCK_STORAGE_KEY(userId)) === '1';
  });

  const availableDates = useMemo(() => Array.from(new Set(trips.map(trip => getTripServiceDateKey(trip, routePlans, trips)).filter(Boolean))).sort((a, b) => String(b).localeCompare(String(a))), [routePlans, trips]);

  const scopedTrips = useMemo(() => trips.filter(trip => {
    const serviceDate = getTripServiceDateKey(trip, routePlans, trips);
    if (selectedDate !== 'all' && serviceDate !== selectedDate) return false;
    if (selectedDriverId !== 'all' && !isTripAssignedToDriver(trip, selectedDriverId)) return false;
    if (onlyAssigned && !String(trip?.driverId || trip?.secondaryDriverId || '').trim()) return false;
    return true;
  }), [onlyAssigned, routePlans, selectedDate, selectedDriverId, trips]);

  const tripRows = useMemo(() => scopedTrips.map(trip => {
    const tripType = getTripTypeCode(trip);
    const billingAmount = getTripBillingAmount(trip);
    return {
      id: String(trip?.brokerTripId || trip?.rideId || trip?.id || '').trim(),
      driverId: String(trip?.driverId || '').trim(),
      driverName: drivers.find(driver => driver.id === trip.driverId)?.name || drivers.find(driver => driver.id === trip.driverId)?.displayName || 'Unassigned',
      rider: String(trip?.rider || '').trim() || '-',
      tripType,
      amount: billingAmount,
      miles: Number(trip?.miles) || 0,
      status: String(trip?.safeRideStatus || trip?.status || '').trim() || '-',
      dateKey: getTripServiceDateKey(trip, routePlans, trips) || '-',
      rawTrip: trip
    };
  }).filter(row => row.amount > 0), [drivers, routePlans, scopedTrips, trips]);

  useEffect(() => {
    if (!isUnlocked) return;

    let ignore = false;

    const loadFuelReceipts = async () => {
      try {
        setLoadingFuelReceipts(true);
        setFuelReceiptError('');

        const query = new URLSearchParams();
        if (selectedDate !== 'all') query.set('serviceDate', selectedDate);
        if (selectedDriverId !== 'all') query.set('driverId', selectedDriverId);

        const response = await fetch(`/api/genius/receipts?${query.toString()}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.success === false) {
          throw new Error(payload?.error || 'Unable to load fuel receipts');
        }

        if (!ignore) {
          setFuelReceipts(Array.isArray(payload?.rows) ? payload.rows : []);
        }
      } catch (error) {
        if (!ignore) {
          setFuelReceiptError(error?.message || 'Unable to load fuel receipts');
          setFuelReceipts([]);
        }
      } finally {
        if (!ignore) {
          setLoadingFuelReceipts(false);
        }
      }
    };

    loadFuelReceipts();

    return () => {
      ignore = true;
    };
  }, [isUnlocked, selectedDate, selectedDriverId]);

  useEffect(() => {
    if (!isUnlocked) return;

    let ignore = false;

    const loadPayoutReceipts = async () => {
      try {
        setLoadingPayoutReceipts(true);
        setPayoutError('');

        const query = new URLSearchParams();
        if (selectedDate !== 'all') query.set('serviceDate', selectedDate);
        if (selectedDriverId !== 'all') query.set('driverId', selectedDriverId);

        const response = await fetch(`/api/genius/payouts?${query.toString()}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.success === false) {
          throw new Error(payload?.error || 'Unable to load payout receipts');
        }

        if (!ignore) {
          setPayoutReceipts(Array.isArray(payload?.rows) ? payload.rows : []);
        }
      } catch (error) {
        if (!ignore) {
          setPayoutError(error?.message || 'Unable to load payout receipts');
          setPayoutReceipts([]);
        }
      } finally {
        if (!ignore) {
          setLoadingPayoutReceipts(false);
        }
      }
    };

    loadPayoutReceipts();

    return () => {
      ignore = true;
    };
  }, [isUnlocked, selectedDate, selectedDriverId]);

  const totals = useMemo(() => tripRows.reduce((acc, row) => {
    acc.totalTrips += 1;
    acc.totalAmount += row.amount;
    acc.totalMiles += row.miles;
    if (row.tripType === 'A') acc.ambulatory += 1;
    if (row.tripType === 'W') acc.wheelchair += 1;
    if (row.tripType === 'STR') acc.stretcher += 1;
    return acc;
  }, {
    totalTrips: 0,
    totalAmount: 0,
    totalMiles: 0,
    ambulatory: 0,
    wheelchair: 0,
    stretcher: 0
  }), [tripRows]);

  const driverSummaries = useMemo(() => {
    const byDriver = new Map();
    for (const row of tripRows) {
      const key = row.driverId || 'unassigned';
      const current = byDriver.get(key) || {
        driverId: key,
        driverName: row.driverName,
        trips: 0,
        amount: 0,
        ambulatory: 0,
        wheelchair: 0,
        stretcher: 0
      };
      current.trips += 1;
      current.amount += row.amount;
      if (row.tripType === 'A') current.ambulatory += 1;
      if (row.tripType === 'W') current.wheelchair += 1;
      if (row.tripType === 'STR') current.stretcher += 1;
      byDriver.set(key, current);
    }
    const receiptSummaryByDriver = fuelReceipts.reduce((acc, receipt) => {
      const key = String(receipt?.driverId || '').trim() || 'unassigned';
      if (!acc[key]) {
        acc[key] = {
          receiptCount: 0,
          receiptAmount: 0
        };
      }
      acc[key].receiptCount += 1;
      acc[key].receiptAmount += Number(receipt?.amount) || 0;
      return acc;
    }, {});

    return Array.from(byDriver.values()).map(row => {
      const receiptSummary = receiptSummaryByDriver[row.driverId] || {
        receiptCount: 0,
        receiptAmount: 0
      };

      return {
        ...row,
        fuelReceiptCount: receiptSummary.receiptCount,
        fuelReceiptAmount: receiptSummary.receiptAmount,
        reimbursementAllowed: receiptSummary.receiptCount > 0
      };
    }).sort((a, b) => b.amount - a.amount);
  }, [fuelReceipts, tripRows]);

  const recentFuelReceipts = useMemo(() => fuelReceipts.slice(0, 40), [fuelReceipts]);
  const recentPayoutReceipts = useMemo(() => payoutReceipts.slice(0, 40), [payoutReceipts]);

  const updateFuelReceiptForm = (field, value) => {
    setFuelReceiptForm(current => ({
      ...current,
      [field]: value
    }));
  };

  const handleFuelReceiptSubmit = async event => {
    event.preventDefault();
    setFuelReceiptError('');
    setFuelReceiptSuccess('');

    if (!fuelReceiptForm.driverId) {
      setFuelReceiptError('Select a driver.');
      return;
    }
    if (!fuelReceiptForm.serviceDate) {
      setFuelReceiptError('Select a service date.');
      return;
    }
    if (!fuelReceiptForm.receiptReference.trim()) {
      setFuelReceiptError('Receipt reference is required.');
      return;
    }

    try {
      setSubmittingFuelReceipt(true);
      const response = await fetch('/api/genius/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: fuelReceiptForm.driverId,
          serviceDate: fuelReceiptForm.serviceDate,
          amount: Number(fuelReceiptForm.amount) || 0,
          gallons: Number(fuelReceiptForm.gallons) || 0,
          receiptReference: fuelReceiptForm.receiptReference,
          receiptImageUrl: fuelReceiptForm.receiptImageUrl,
          notes: fuelReceiptForm.notes
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || 'Unable to save fuel receipt');
      }

      const createdReceipt = payload?.receipt;
      setFuelReceipts(current => [createdReceipt, ...current]);
      setFuelReceiptSuccess('Fuel receipt saved. Reimbursement is now unlocked for this driver/date scope.');
      setFuelReceiptForm(current => ({
        ...current,
        amount: '',
        gallons: '',
        receiptReference: '',
        receiptImageUrl: '',
        notes: ''
      }));
    } catch (error) {
      setFuelReceiptError(error?.message || 'Unable to save fuel receipt');
    } finally {
      setSubmittingFuelReceipt(false);
    }
  };

  const handleUnlock = async event => {
    event.preventDefault();
    const normalizedCode = String(code || '').replace(/\D/g, '').slice(0, 6);
    if (normalizedCode.length !== 6) {
      setUnlockError('Enter your 6-digit code.');
      return;
    }

    try {
      setUnlocking(true);
      setUnlockError('');
      const response = await fetch('/api/genius/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalizedCode })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || 'Invalid code');
      }
      if (typeof window !== 'undefined' && userId) {
        window.sessionStorage.setItem(ALLOWED_UNLOCK_STORAGE_KEY(userId), '1');
      }
      setIsUnlocked(true);
      setCode('');
    } catch (error) {
      setUnlockError(error?.message || 'Unable to unlock Genius');
    } finally {
      setUnlocking(false);
    }
  };

  const handleCreatePayout = async () => {
    setPayoutError('');
    setPayoutSuccess('');

    if (selectedDate === 'all') {
      setPayoutError('Select a specific date to run payout.');
      return;
    }
    if (selectedDriverId === 'all') {
      setPayoutError('Select a specific driver to run payout.');
      return;
    }

    try {
      setCreatingPayout(true);
      const response = await fetch('/api/genius/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceDate: selectedDate,
          driverId: selectedDriverId
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || 'Unable to create payout receipt');
      }

      setPayoutReceipts(current => [payload.payout, ...current]);
      setPayoutSuccess('Payout receipt created and frozen successfully.');
    } catch (error) {
      setPayoutError(error?.message || 'Unable to create payout receipt');
    } finally {
      setCreatingPayout(false);
    }
  };

  const handlePrintPayoutReceipt = payout => {
    if (typeof window === 'undefined' || !payout) return;

    const html = `
      <html>
        <head>
          <title>Payout Receipt ${payout.serviceDate || ''}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { margin: 0 0 4px; }
            .muted { color: #6b7280; margin-bottom: 14px; }
            .row { margin: 6px 0; }
            .label { font-weight: 700; display: inline-block; width: 200px; }
          </style>
        </head>
        <body>
          <h1>Payout Receipt</h1>
          <div class="muted">Generated by Genius Billing</div>
          <div class="row"><span class="label">Receipt ID:</span> ${payout.id || '-'}</div>
          <div class="row"><span class="label">Service Date:</span> ${payout.serviceDate || '-'}</div>
          <div class="row"><span class="label">Driver ID:</span> ${payout.driverId || '-'}</div>
          <div class="row"><span class="label">Trips:</span> ${payout.tripCount || 0}</div>
          <div class="row"><span class="label">W/A/STR:</span> ${payout.wheelchairCount || 0}/${payout.ambulatoryCount || 0}/${payout.stretcherCount || 0}</div>
          <div class="row"><span class="label">Gross:</span> ${money(payout.grossAmount || 0)}</div>
          <div class="row"><span class="label">Fuel Receipts:</span> ${payout.fuelReceiptCount || 0}</div>
          <div class="row"><span class="label">Fuel Total:</span> ${money(payout.fuelTotal || 0)}</div>
          <div class="row"><span class="label">Reimbursement:</span> ${payout.reimburseAllowed ? 'Unlocked' : 'Locked'}</div>
          <div class="row"><span class="label">Created:</span> ${String(payout.createdAt || '').replace('T', ' ').slice(0, 19) || '-'}</div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleSendPayoutEmail = async payout => {
    if (!payout?.id) return;

    try {
      setSendingPayoutEmailId(payout.id);
      setPayoutError('');
      setPayoutSuccess('');

      const response = await fetch('/api/genius/payouts/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payoutId: payout.id })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || 'Unable to send payout email');
      }

      setPayoutSuccess(`Payout email sent to ${payload?.sentTo || 'driver email'}.`);
    } catch (error) {
      setPayoutError(error?.message || 'Unable to send payout email');
    } finally {
      setSendingPayoutEmailId('');
    }
  };

  if (!isUnlocked) {
    return <div className="container-fluid py-4">
      <Row className="justify-content-center">
        <Col xl={6} lg={7} md={9}>
          <Card className="shadow-sm border-0" style={{ borderRadius: 22, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #2563eb 100%)', color: '#fff', padding: '1.2rem 1.4rem' }}>
              <div className="small text-uppercase" style={{ letterSpacing: '0.18em', opacity: 0.8 }}>Private Billing</div>
              <h2 className="mb-0" style={{ fontWeight: 800 }}>Genius</h2>
            </div>
            <CardBody className="p-4 p-lg-5">
              <p className="text-muted mb-4">Enter your personal 6-digit code to open Genius. This area is restricted to Robert and Balbino.</p>
              <Form onSubmit={handleUnlock} className="d-flex flex-column gap-3">
                <Form.Control value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="Enter 6-digit code" size="lg" />
                {unlockError ? <Alert variant="danger" className="mb-0">{unlockError}</Alert> : null}
                <Button type="submit" disabled={unlocking} size="lg" style={{ backgroundColor: '#16a34a', borderColor: '#16a34a', fontWeight: 700 }}>
                  {unlocking ? 'Unlocking...' : 'Open Genius'}
                </Button>
              </Form>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>;
  }

  return <div className="container-fluid py-4">
    <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
      <div>
        <div className="small text-uppercase text-muted" style={{ letterSpacing: '0.18em' }}>Private Billing Engine</div>
        <h1 className="mb-1" style={{ fontWeight: 800 }}>Genius</h1>
        <div className="text-muted">Original internal workspace for SafeRide trip revenue, driver payout review, and audit-safe calculations.</div>
      </div>
      <Badge bg="dark" className="px-3 py-2">Private: Robert + Balbino</Badge>
    </div>

    <Row className="g-3 mb-4">
      <Col xl={3} md={6}><Card className="border-0 shadow-sm h-100"><CardBody><div className="small text-uppercase text-muted">Trips</div><div style={{ fontSize: 34, fontWeight: 800 }}>{totals.totalTrips}</div><div className="text-muted small">Counted from current SafeRide/rates data</div></CardBody></Card></Col>
      <Col xl={3} md={6}><Card className="border-0 shadow-sm h-100"><CardBody><div className="small text-uppercase text-muted">Gross Total</div><div style={{ fontSize: 34, fontWeight: 800 }}>{money(totals.totalAmount)}</div><div className="text-muted small">Estimated from configured rates</div></CardBody></Card></Col>
      <Col xl={3} md={6}><Card className="border-0 shadow-sm h-100"><CardBody><div className="small text-uppercase text-muted">Wheelchair / Amb / STR</div><div style={{ fontSize: 28, fontWeight: 800 }}>{totals.wheelchair} / {totals.ambulatory} / {totals.stretcher}</div><div className="text-muted small">LOS mix</div></CardBody></Card></Col>
      <Col xl={3} md={6}><Card className="border-0 shadow-sm h-100"><CardBody><div className="small text-uppercase text-muted">Miles</div><div style={{ fontSize: 34, fontWeight: 800 }}>{totals.totalMiles.toFixed(1)}</div><div className="text-muted small">Mileage captured from trip data</div></CardBody></Card></Col>
    </Row>

    <Card className="border-0 shadow-sm mb-4"><CardBody>
      <Row className="g-3 align-items-end">
        <Col lg={4}><Form.Label>Date</Form.Label><Form.Select value={selectedDate} onChange={event => setSelectedDate(event.target.value)}><option value="all">All dates</option>{availableDates.map(dateKey => <option key={dateKey} value={dateKey}>{dateKey}</option>)}</Form.Select></Col>
        <Col lg={4}><Form.Label>Driver</Form.Label><Form.Select value={selectedDriverId} onChange={event => setSelectedDriverId(event.target.value)}><option value="all">All drivers</option>{drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name || driver.displayName || driver.username || driver.id}</option>)}</Form.Select></Col>
        <Col lg={2}><Form.Check type="switch" id="genius-only-assigned" label="Only assigned trips" checked={onlyAssigned} onChange={event => setOnlyAssigned(event.target.checked)} /></Col>
        <Col lg={2} className="d-grid"><Button variant="dark" onClick={handleCreatePayout} disabled={creatingPayout}>{creatingPayout ? 'Running...' : 'Run payout'}</Button></Col>
      </Row>
      {payoutError ? <Alert variant="danger" className="mt-3 mb-0">{payoutError}</Alert> : null}
      {payoutSuccess ? <Alert variant="success" className="mt-3 mb-0">{payoutSuccess}</Alert> : null}
    </CardBody></Card>

    <Card className="border-0 shadow-sm mb-4"><CardBody>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Fuel receipt intake</h4>
        <Badge bg="dark">Permanent audit record (non-deletable)</Badge>
      </div>
      <Form onSubmit={handleFuelReceiptSubmit}>
        <Row className="g-3">
          <Col lg={3}><Form.Label>Driver</Form.Label><Form.Select value={fuelReceiptForm.driverId} onChange={event => updateFuelReceiptForm('driverId', event.target.value)}><option value="">Select driver</option>{drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name || driver.displayName || driver.username || driver.id}</option>)}</Form.Select></Col>
          <Col lg={2}><Form.Label>Date</Form.Label><Form.Control type="date" value={fuelReceiptForm.serviceDate} onChange={event => updateFuelReceiptForm('serviceDate', event.target.value)} /></Col>
          <Col lg={2}><Form.Label>Fuel $</Form.Label><Form.Control type="number" step="0.01" min="0" placeholder="0.00" value={fuelReceiptForm.amount} onChange={event => updateFuelReceiptForm('amount', event.target.value)} /></Col>
          <Col lg={2}><Form.Label>Gallons</Form.Label><Form.Control type="number" step="0.001" min="0" placeholder="0" value={fuelReceiptForm.gallons} onChange={event => updateFuelReceiptForm('gallons', event.target.value)} /></Col>
          <Col lg={3}><Form.Label>Receipt Ref</Form.Label><Form.Control placeholder="Ticket / invoice #" value={fuelReceiptForm.receiptReference} onChange={event => updateFuelReceiptForm('receiptReference', event.target.value)} /></Col>
          <Col lg={6}><Form.Label>Receipt Image URL (optional)</Form.Label><Form.Control placeholder="https://... or stored image URL" value={fuelReceiptForm.receiptImageUrl} onChange={event => updateFuelReceiptForm('receiptImageUrl', event.target.value)} /></Col>
          <Col lg={6}><Form.Label>Notes</Form.Label><Form.Control placeholder="Station, reason, adjustment details..." value={fuelReceiptForm.notes} onChange={event => updateFuelReceiptForm('notes', event.target.value)} /></Col>
          <Col lg={12} className="d-flex justify-content-end"><Button type="submit" disabled={submittingFuelReceipt}>{submittingFuelReceipt ? 'Saving...' : 'Save fuel receipt'}</Button></Col>
        </Row>
      </Form>
      {fuelReceiptError ? <Alert variant="danger" className="mt-3 mb-0">{fuelReceiptError}</Alert> : null}
      {fuelReceiptSuccess ? <Alert variant="success" className="mt-3 mb-0">{fuelReceiptSuccess}</Alert> : null}
    </CardBody></Card>

    <Row className="g-4">
      <Col xl={5}>
        <Card className="border-0 shadow-sm h-100"><CardBody>
          <div className="d-flex justify-content-between align-items-center mb-3"><h4 className="mb-0">Driver payout view</h4><Badge bg="secondary">{driverSummaries.length} drivers</Badge></div>
          <Table responsive hover>
            <thead><tr><th>Driver</th><th>Trips</th><th>W/A/STR</th><th>Total</th><th>Fuel Receipts</th><th>Fuel $</th><th>Reimbursement</th></tr></thead>
            <tbody>
              {driverSummaries.length === 0 ? <tr><td colSpan={7} className="text-center text-muted py-4">No billable trips in this filter.</td></tr> : driverSummaries.map(row => <tr key={row.driverId}><td>{row.driverName}</td><td>{row.trips}</td><td>{row.wheelchair}/{row.ambulatory}/{row.stretcher}</td><td>{money(row.amount)}</td><td>{row.fuelReceiptCount}</td><td>{money(row.fuelReceiptAmount)}</td><td><Badge bg={row.reimbursementAllowed ? 'success' : 'danger'}>{row.reimbursementAllowed ? 'Unlocked' : 'Locked'}</Badge></td></tr>)}
            </tbody>
          </Table>
        </CardBody></Card>
      </Col>
      <Col xl={7}>
        <Card className="border-0 shadow-sm h-100"><CardBody>
          <div className="d-flex justify-content-between align-items-center mb-3"><h4 className="mb-0">Trip ledger</h4><Badge bg="secondary">{tripRows.length} rows</Badge></div>
          <Table responsive hover>
            <thead><tr><th>Trip</th><th>Date</th><th>Driver</th><th>Rider</th><th>Type</th><th>Status</th><th>Total</th></tr></thead>
            <tbody>
              {tripRows.length === 0 ? <tr><td colSpan={7} className="text-center text-muted py-4">No billable trips found.</td></tr> : tripRows.slice(0, 250).map(row => <tr key={`${row.id}-${row.dateKey}`}><td>{row.id || '-'}</td><td>{row.dateKey}</td><td>{row.driverName}</td><td>{row.rider}</td><td><Badge bg={row.tripType === 'W' ? 'warning' : row.tripType === 'STR' ? 'danger' : 'success'} text={row.tripType === 'W' ? 'dark' : undefined}>{row.tripType}</Badge></td><td>{row.status}</td><td>{money(row.amount)}</td></tr>)}
            </tbody>
          </Table>
        </CardBody></Card>
      </Col>
    </Row>

    <Card className="border-0 shadow-sm mt-4"><CardBody>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Fuel receipt ledger</h4>
        <Badge bg="secondary">{loadingFuelReceipts ? 'Loading...' : `${fuelReceipts.length} rows`}</Badge>
      </div>
      <Table responsive hover>
        <thead><tr><th>Created</th><th>Date</th><th>Driver ID</th><th>Reference</th><th>Gallons</th><th>Amount</th><th>Source</th></tr></thead>
        <tbody>
          {recentFuelReceipts.length === 0 ? <tr><td colSpan={7} className="text-center text-muted py-4">No fuel receipts in this scope.</td></tr> : recentFuelReceipts.map(row => <tr key={row.id}><td>{String(row?.createdAt || '').slice(0, 19).replace('T', ' ') || '-'}</td><td>{row?.serviceDate || '-'}</td><td>{row?.driverId || '-'}</td><td>{row?.receiptReference || '-'}</td><td>{Number(row?.gallons || 0).toFixed(3)}</td><td>{money(row?.amount || 0)}</td><td>{row?.source || '-'}</td></tr>)}
        </tbody>
      </Table>
    </CardBody></Card>

    <Card className="border-0 shadow-sm mt-4"><CardBody>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Payout receipt ledger</h4>
        <Badge bg="secondary">{loadingPayoutReceipts ? 'Loading...' : `${payoutReceipts.length} rows`}</Badge>
      </div>
      <Table responsive hover>
        <thead><tr><th>Created</th><th>Date</th><th>Driver ID</th><th>Trips</th><th>W/A/STR</th><th>Gross</th><th>Fuel Receipts</th><th>Fuel $</th><th>Reimbursement</th><th>Actions</th></tr></thead>
        <tbody>
          {recentPayoutReceipts.length === 0 ? <tr><td colSpan={10} className="text-center text-muted py-4">No payout receipts in this scope.</td></tr> : recentPayoutReceipts.map(row => <tr key={row.id}><td>{String(row?.createdAt || '').slice(0, 19).replace('T', ' ') || '-'}</td><td>{row?.serviceDate || '-'}</td><td>{row?.driverId || '-'}</td><td>{row?.tripCount || 0}</td><td>{row?.wheelchairCount || 0}/{row?.ambulatoryCount || 0}/{row?.stretcherCount || 0}</td><td>{money(row?.grossAmount || 0)}</td><td>{row?.fuelReceiptCount || 0}</td><td>{money(row?.fuelTotal || 0)}</td><td><Badge bg={row?.reimburseAllowed ? 'success' : 'danger'}>{row?.reimburseAllowed ? 'Unlocked' : 'Locked'}</Badge></td><td className="d-flex flex-wrap gap-2"><Button size="sm" variant="outline-dark" onClick={() => handlePrintPayoutReceipt(row)}>Print/PDF</Button><Button size="sm" variant="dark" onClick={() => handleSendPayoutEmail(row)} disabled={sendingPayoutEmailId === row.id}>{sendingPayoutEmailId === row.id ? 'Sending...' : 'Send Email'}</Button></td></tr>)}
        </tbody>
      </Table>
    </CardBody></Card>

    <Alert variant="info" className="mt-4 mb-0">Phase 3 is live: immutable payout runs, payout receipt ledger, and driver portal-ready receipts for both fuel and payout history.</Alert>
  </div>;
};

export default GeniusWorkspace;
