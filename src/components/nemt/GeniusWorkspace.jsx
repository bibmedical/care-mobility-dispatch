'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, CardBody, Col, Form, Row, Table } from 'react-bootstrap';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
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
const API_TIMEOUT_MS = 15000;

const fetchWithTimeout = async (input, init = {}) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

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
    vehicleMileage: '',
    receiptReference: '',
    receiptImageUrl: '',
    notes: ''
  });
  const [isUnlocked, setIsUnlocked] = useState(false);

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

        const response = await fetchWithTimeout(`/api/genius/receipts?${query.toString()}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.success === false) {
          throw new Error(payload?.error || 'Unable to load fuel receipts');
        }

        if (!ignore) {
          setFuelReceipts(Array.isArray(payload?.rows) ? payload.rows : []);
        }
      } catch (error) {
        if (!ignore) {
          setFuelReceiptError(error?.name === 'AbortError' ? 'Genius fuel receipts timed out.' : error?.message || 'Unable to load fuel receipts');
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

        const response = await fetchWithTimeout(`/api/genius/payouts?${query.toString()}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.success === false) {
          throw new Error(payload?.error || 'Unable to load payout receipts');
        }

        if (!ignore) {
          setPayoutReceipts(Array.isArray(payload?.rows) ? payload.rows : []);
        }
      } catch (error) {
        if (!ignore) {
          setPayoutError(error?.name === 'AbortError' ? 'Genius payouts timed out.' : error?.message || 'Unable to load payout receipts');
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
  const paymentCards = useMemo(() => {
    const gross = Number(totals.totalAmount || 0);
    return [{
      title: 'Wire Transfer',
      amount: gross * 0.44,
      goal: gross * 0.6,
      icon: '⇄'
    }, {
      title: 'Crypto',
      amount: gross * 0.19,
      goal: gross * 0.34,
      icon: '₿'
    }, {
      title: 'Credit Card',
      amount: gross * 0.23,
      goal: gross * 0.5,
      icon: '💳'
    }, {
      title: 'PayPal',
      amount: gross * 0.14,
      goal: gross * 0.22,
      icon: 'Ⓟ'
    }];
  }, [totals.totalAmount]);
  const analyticsBars = useMemo(() => {
    const maxAmount = Number(driverSummaries?.[0]?.amount || 0);
    const normalized = driverSummaries.slice(0, 12).map((row, index) => {
      if (maxAmount <= 0) return 40 + (index % 5) * 10;
      return Math.max(22, Math.min(96, Math.round(Number(row.amount || 0) / maxAmount * 100)));
    });
    return normalized.length > 0 ? normalized : [70, 55, 60, 76, 49, 66, 58, 82, 64, 72, 88, 74];
  }, [driverSummaries]);
  const topBreakdownRows = useMemo(() => {
    return driverSummaries.slice(0, 7).map(row => ({
      id: row.driverId,
      label: row.driverName || row.driverId || 'Driver',
      amount: Number(row.amount || 0)
    }));
  }, [driverSummaries]);

  const sidebarDrivers = useMemo(() => {
    return drivers
      .map(driver => ({
        id: String(driver?.id || '').trim(),
        name: String(driver?.name || driver?.displayName || driver?.username || driver?.id || '').trim() || 'Driver'
      }))
      .filter(driver => driver.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [drivers]);

  const scrollToSection = sectionId => {
    if (typeof document === 'undefined') return;
    const node = document.getElementById(sectionId);
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
    if (!fuelReceiptForm.receiptReference.trim() && !fuelReceiptForm.receiptImageUrl.trim()) {
      setFuelReceiptError('Add receipt reference or receipt image URL.');
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
          vehicleMileage: fuelReceiptForm.vehicleMileage !== '' ? Number(fuelReceiptForm.vehicleMileage) : null,
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
        vehicleMileage: '',
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
              <div className="d-flex align-items-center gap-2 mb-3">
                <Image src="/genius/genius-icon.png" alt="Genius icon" width={28} height={28} priority />
                <Image src="/genius/genius-horizontal.png" alt="Genius" width={132} height={32} priority style={{ height: 'auto' }} />
              </div>
              <div className="small text-uppercase" style={{ letterSpacing: '0.18em', opacity: 0.8 }}>Private Billing</div>
              <h2 className="mb-0" style={{ fontWeight: 800 }}>Genius</h2>
            </div>
            <CardBody className="p-4 p-lg-5">
              <p className="text-muted mb-4">Enter your personal 6-digit code to open Genius. This area is restricted.</p>
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

  return <div style={{ background: '#eef0f2', minHeight: '100vh', padding: 14 }}>
    <Card className="border-0" style={{ borderRadius: 18, overflow: 'hidden', boxShadow: '0 14px 45px rgba(2, 6, 23, 0.08)' }}>
      <Row className="g-0">
        <Col xl={2} lg={3} className="d-none d-lg-block" style={{ background: '#f9f9f9', borderRight: '1px solid #ececec', minHeight: '95vh' }}>
          <div style={{ padding: 22, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="d-flex align-items-center gap-2 mb-4">
              <Image src="/genius/genius-icon.png" alt="Genius icon" width={24} height={24} priority />
              <Image src="/genius/genius-horizontal.png" alt="Genius" width={120} height={26} priority style={{ height: 'auto' }} />
            </div>
            <div className="small text-uppercase text-muted mb-2" style={{ letterSpacing: '0.12em' }}>Main</div>
            <button type="button" onClick={() => scrollToSection('genius-dashboard')} style={{ display: 'block', border: 'none', background: 'transparent', padding: 0, marginBottom: 9, fontWeight: 700, fontSize: 14, color: '#111827', cursor: 'pointer' }}>Dashboard</button>
            <button type="button" onClick={() => scrollToSection('genius-payouts')} style={{ display: 'block', border: 'none', background: 'transparent', padding: 0, marginBottom: 9, fontSize: 14, color: '#6b7280', cursor: 'pointer' }}>Payouts</button>
            <button type="button" onClick={() => scrollToSection('genius-fuel-receipts')} style={{ display: 'block', border: 'none', background: 'transparent', padding: 0, marginBottom: 9, fontSize: 14, color: '#6b7280', cursor: 'pointer' }}>Fuel Receipts</button>
            <button type="button" onClick={() => scrollToSection('genius-driver-review')} style={{ display: 'block', border: 'none', background: 'transparent', padding: 0, marginBottom: 9, fontSize: 14, color: '#6b7280', cursor: 'pointer' }}>Driver Review</button>
            <div style={{ marginTop: 18, borderTop: '1px solid #ececec', paddingTop: 14, display: 'flex', flexDirection: 'column', flex: 1, minHeight: '360px' }}>
              <div className="small text-uppercase text-muted mb-2" style={{ letterSpacing: '0.12em' }}>Drivers</div>
              <div style={{ flex: 1, minHeight: '320px', overflowY: 'auto', paddingRight: 6 }}>
                {sidebarDrivers.length === 0 ? <div className="small text-muted">No drivers</div> : sidebarDrivers.map(driver => <button
                  key={driver.id}
                  type="button"
                  onClick={() => {
                    setSelectedDriverId(driver.id);
                    setFuelReceiptForm(current => ({ ...current, driverId: driver.id }));
                    setOnlyAssigned(true);
                    setPayoutError('');
                    scrollToSection('genius-fuel-receipts');
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: selectedDriverId === driver.id ? '1px solid #22c55e' : '1px solid #e5e7eb',
                    background: selectedDriverId === driver.id ? '#ecfdf5' : '#fff',
                    borderRadius: 8,
                    padding: '6px 8px',
                    marginBottom: 6,
                    fontSize: 12,
                    color: '#111827',
                    cursor: 'pointer'
                  }}
                >
                  {driver.name}
                </button>)}
              </div>
            </div>
          </div>
        </Col>

        <Col xl={10} lg={9} xs={12}>
          <div style={{ padding: 20 }}>
            <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap mb-3">
              <Form.Control placeholder="Search driver, payout, trip..." style={{ maxWidth: 420, borderRadius: 24, background: '#f8fafc' }} />
              <Button style={{ borderRadius: 18, backgroundColor: '#eab308', borderColor: '#eab308', color: '#111827', fontWeight: 700 }}>+ Add New</Button>
            </div>

            <Card id="genius-dashboard" className="border-0 mb-3" style={{ background: '#f7f7f8', borderRadius: 14 }}>
              <CardBody className="py-3 d-flex align-items-center justify-content-between flex-wrap gap-3">
                <div>
                  <div className="small text-muted">Revenue Source</div>
                  <div style={{ fontWeight: 800, fontSize: 28 }}>{money(totals.totalAmount)}</div>
                </div>
                <div className="d-flex gap-3">
                  <div><div className="small text-muted">Trips</div><div style={{ fontWeight: 800 }}>{totals.totalTrips}</div></div>
                  <div><div className="small text-muted">Miles</div><div style={{ fontWeight: 800 }}>{totals.totalMiles.toFixed(1)}</div></div>
                  <div><div className="small text-muted">W/A/STR</div><div style={{ fontWeight: 800 }}>{totals.wheelchair}/{totals.ambulatory}/{totals.stretcher}</div></div>
                </div>
              </CardBody>
            </Card>

            <Row id="genius-driver-review" className="g-3 mb-3">
              {paymentCards.map(card => <Col xl={3} md={6} key={card.title}>
                <Card className="border-0 h-100" style={{ background: '#f4f4f5', borderRadius: 14 }}>
                  <CardBody>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <div style={{ fontWeight: 700 }}>{card.title}</div>
                      <span style={{ fontSize: 18 }}>{card.icon}</span>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 26 }}>{money(card.amount)}</div>
                    <div className="small text-muted">/ {money(card.goal)}</div>
                  </CardBody>
                </Card>
              </Col>)}
            </Row>

            <Row className="g-3 mb-3">
              <Col xl={7}>
                <Card className="border-0" style={{ borderRadius: 14 }}>
                  <CardBody>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <div style={{ fontWeight: 700 }}>Analytics</div>
                      <div className="small text-muted">Driver payout intensity</div>
                    </div>
                    <div style={{ height: 146, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                      {analyticsBars.map((height, index) => <div key={`bar-${index}`} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                        <div style={{ width: '100%', maxWidth: 16, height: `${height}%`, borderRadius: 8, background: index % 2 === 0 ? '#34d399' : '#fb7185' }} />
                      </div>)}
                    </div>
                  </CardBody>
                </Card>
              </Col>
              <Col xl={5}>
                <Card className="border-0" style={{ borderRadius: 14 }}>
                  <CardBody>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <div style={{ fontWeight: 700 }}>Revenue Breakdown</div>
                      <div className="small text-muted">Top drivers</div>
                    </div>
                    {topBreakdownRows.length === 0 ? <div className="text-muted small">No billable rows in this filter.</div> : topBreakdownRows.map(row => <div key={row.id} className="d-flex justify-content-between align-items-center py-2" style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <div className="small" style={{ maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</div>
                      <div style={{ color: '#10b981', fontWeight: 700 }}>{money(row.amount)}</div>
                    </div>)}
                  </CardBody>
                </Card>
              </Col>
            </Row>

            <Card id="genius-payouts" className="border-0 mb-3" style={{ borderRadius: 14 }}>
              <CardBody>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div style={{ fontWeight: 700 }}>Run payout</div>
                  <div className="small text-muted">Quick action panel</div>
                </div>
                <Row className="g-2 align-items-end">
                  <Col lg={4}><Form.Label className="small text-muted mb-1">Date</Form.Label><Form.Select value={selectedDate} onChange={event => setSelectedDate(event.target.value)}><option value="all">All dates</option>{availableDates.map(dateKey => <option key={dateKey} value={dateKey}>{dateKey}</option>)}</Form.Select></Col>
                  <Col lg={4}><Form.Label className="small text-muted mb-1">Driver</Form.Label><Form.Select value={selectedDriverId} onChange={event => {
                    const nextDriverId = event.target.value;
                    setSelectedDriverId(nextDriverId);
                    setFuelReceiptForm(current => ({ ...current, driverId: nextDriverId === 'all' ? '' : nextDriverId }));
                  }}><option value="all">All drivers</option>{drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name || driver.displayName || driver.username || driver.id}</option>)}</Form.Select></Col>
                  <Col lg={2}><Form.Check type="switch" id="genius-only-assigned" label="Assigned" checked={onlyAssigned} onChange={event => setOnlyAssigned(event.target.checked)} /></Col>
                  <Col lg={2} className="d-grid"><Button variant="dark" onClick={handleCreatePayout} disabled={creatingPayout}>{creatingPayout ? 'Running...' : 'Run payout'}</Button></Col>
                </Row>
                {payoutError ? <Alert variant="danger" className="mt-3 mb-0">{payoutError}</Alert> : null}
                {payoutSuccess ? <Alert variant="success" className="mt-3 mb-0">{payoutSuccess}</Alert> : null}
              </CardBody>
            </Card>

            <Card id="genius-fuel-receipts" className="border-0 mb-3" style={{ borderRadius: 14 }}>
              <CardBody>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div style={{ fontWeight: 700 }}>Fuel intake</div>
                  <Badge bg="secondary">{loadingFuelReceipts ? 'Loading...' : `${fuelReceipts.length} rows`}</Badge>
                </div>
                <Form onSubmit={handleFuelReceiptSubmit}>
                  <Row className="g-2">
                    <Col lg={3}><Form.Select value={fuelReceiptForm.driverId} onChange={event => {
                      const nextDriverId = event.target.value;
                      updateFuelReceiptForm('driverId', nextDriverId);
                      if (nextDriverId) setSelectedDriverId(nextDriverId);
                    }}><option value="">Driver</option>{drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name || driver.displayName || driver.username || driver.id}</option>)}</Form.Select></Col>
                    <Col lg={2}><Form.Control type="date" value={fuelReceiptForm.serviceDate} onChange={event => updateFuelReceiptForm('serviceDate', event.target.value)} /></Col>
                    <Col lg={2}><Form.Control type="number" step="0.01" min="0" placeholder="Fuel $" value={fuelReceiptForm.amount} onChange={event => updateFuelReceiptForm('amount', event.target.value)} /></Col>
                    <Col lg={2}><Form.Control type="number" step="0.001" min="0" placeholder="Gallons" value={fuelReceiptForm.gallons} onChange={event => updateFuelReceiptForm('gallons', event.target.value)} /></Col>
                    <Col lg={3}><Form.Control type="number" step="0.1" min="0" placeholder="Mileage" value={fuelReceiptForm.vehicleMileage} onChange={event => updateFuelReceiptForm('vehicleMileage', event.target.value)} /></Col>
                    <Col lg={4}><Form.Control placeholder="Receipt Ref (optional)" value={fuelReceiptForm.receiptReference} onChange={event => updateFuelReceiptForm('receiptReference', event.target.value)} /></Col>
                    <Col lg={5}><Form.Control placeholder="Receipt Image URL" value={fuelReceiptForm.receiptImageUrl} onChange={event => updateFuelReceiptForm('receiptImageUrl', event.target.value)} /></Col>
                    <Col lg={3}><Form.Control placeholder="Notes" value={fuelReceiptForm.notes} onChange={event => updateFuelReceiptForm('notes', event.target.value)} /></Col>
                    <Col lg={12} className="d-flex justify-content-end"><Button type="submit" disabled={submittingFuelReceipt}>{submittingFuelReceipt ? 'Saving...' : 'Save fuel receipt'}</Button></Col>
                  </Row>
                </Form>
                {fuelReceiptError ? <Alert variant="danger" className="mt-3 mb-0">{fuelReceiptError}</Alert> : null}
                {fuelReceiptSuccess ? <Alert variant="success" className="mt-3 mb-0">{fuelReceiptSuccess}</Alert> : null}

                <div className="mt-3">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <div style={{ fontWeight: 700 }}>Recent fuel mileage tracking</div>
                    <div className="small text-muted">Latest 10 receipts</div>
                  </div>
                  <Table responsive size="sm" hover>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Driver</th>
                        <th>Request Odo</th>
                        <th>Prev Odo</th>
                        <th>Miles Since Last Fuel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentFuelReceipts.slice(0, 10).length === 0 ? (
                        <tr><td colSpan={5} className="text-center text-muted py-3">No fuel receipts yet.</td></tr>
                      ) : recentFuelReceipts.slice(0, 10).map(row => (
                        <tr key={row.id}>
                          <td>{row?.serviceDate || '-'}</td>
                          <td>{row?.driverId || '-'}</td>
                          <td>{row?.requestVehicleMileage != null ? Number(row.requestVehicleMileage).toFixed(1) : '-'}</td>
                          <td>{row?.previousVehicleMileage != null ? Number(row.previousVehicleMileage).toFixed(1) : '-'}</td>
                          <td>{row?.milesSinceLastFuel != null ? Number(row.milesSinceLastFuel).toFixed(1) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </CardBody>
            </Card>

            <Card className="border-0" style={{ borderRadius: 14 }}>
              <CardBody>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div style={{ fontWeight: 700 }}>Recent payout receipts</div>
                  <Badge bg="secondary">{loadingPayoutReceipts ? 'Loading...' : `${payoutReceipts.length} rows`}</Badge>
                </div>
                <Table responsive hover>
                  <thead><tr><th>Date</th><th>Driver</th><th>Trips</th><th>Gross</th><th>Fuel</th><th>Actions</th></tr></thead>
                  <tbody>
                    {recentPayoutReceipts.length === 0 ? <tr><td colSpan={6} className="text-center text-muted py-4">No payout receipts in this scope.</td></tr> : recentPayoutReceipts.slice(0, 14).map(row => <tr key={row.id}><td>{row?.serviceDate || '-'}</td><td>{row?.driverId || '-'}</td><td>{row?.tripCount || 0}</td><td>{money(row?.grossAmount || 0)}</td><td>{money(row?.fuelTotal || 0)}</td><td className="d-flex flex-wrap gap-2"><Button size="sm" variant="outline-dark" onClick={() => handlePrintPayoutReceipt(row)}>Print/PDF</Button><Button size="sm" variant="dark" onClick={() => handleSendPayoutEmail(row)} disabled={sendingPayoutEmailId === row.id}>{sendingPayoutEmailId === row.id ? 'Sending...' : 'Send Email'}</Button></td></tr>)}
                  </tbody>
                </Table>
              </CardBody>
            </Card>
          </div>
        </Col>
      </Row>
    </Card>
  </div>;
};

export default GeniusWorkspace;
