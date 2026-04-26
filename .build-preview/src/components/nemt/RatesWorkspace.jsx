'use client';

import IconifyIcon from '@/components/wrappers/IconifyIcon';
import { useLayoutContext } from '@/context/useLayoutContext';
import { useNemtContext } from '@/context/useNemtContext';
import { RATE_TABLES, getTripBillingAmount, isTripBillable } from '@/helpers/nemt-billing';
import React, { useMemo, useState } from 'react';
import { Button, Card, CardBody, Col, Form, Row, Table } from 'react-bootstrap';

const buildShellStyles = isLight => ({
  windowHeader: {
    backgroundColor: isLight ? '#374151' : '#23324a'
  },
  body: {
    backgroundColor: isLight ? '#ffffff' : '#171b27'
  },
  toolbarButton: {
    backgroundColor: isLight ? '#f3f7fc' : '#101521',
    borderColor: isLight ? '#c8d4e6' : '#2a3144',
    color: isLight ? '#0f172a' : '#e6ecff'
  },
  primaryPill: {
    backgroundColor: isLight ? '#4b5563' : '#2f60c9',
    borderColor: isLight ? '#4b5563' : '#2f60c9',
    color: '#fff'
  },
  activeTab: {
    backgroundColor: isLight ? '#e5e7eb' : '#8dc63f',
    borderColor: isLight ? '#d1d5db' : '#8dc63f',
    color: isLight ? '#111827' : '#08131a'
  },
  inactiveTab: {
    backgroundColor: isLight ? '#f6f7fb' : '#101521',
    borderColor: isLight ? '#cfd6e4' : '#2a3144',
    color: isLight ? '#08131a' : '#e6ecff'
  },
  tableShell: {
    borderColor: isLight ? '#d5deea' : '#2a3144',
    backgroundColor: isLight ? '#ffffff' : '#171b27'
  },
  tableHead: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    backgroundColor: isLight ? '#e5e7eb' : '#8dc63f',
    color: isLight ? '#111827' : '#fff'
  },
  tableHeadCell: {
    backgroundColor: isLight ? '#e5e7eb' : '#8dc63f',
    color: isLight ? '#111827' : '#fff',
    borderColor: isLight ? '#d1d5db' : 'rgba(255,255,255,0.2)',
    fontWeight: 400
  },
  rowBackground: {
    selected: isLight ? '#eef0f3' : '#202c42',
    default: isLight ? '#ffffff' : '#171b27'
  },
  rowTextColor: isLight ? '#0f172a' : '#e6ecff'
});

const TABS = [{
  key: 'bucket-pricing',
  label: 'Bucket Pricing'
}, {
  key: 'standard-pricing',
  label: 'Standard Pricing'
}, {
  key: 'los-types',
  label: 'LOS Types'
}, {
  key: 'age-buckets',
  label: 'Age Buckets'
}];

const actionButtonsByTab = {
  'bucket-pricing': ['Add Distance'],
  'standard-pricing': ['Add Distance'],
  'los-types': ['Add LOS'],
  'age-buckets': ['Add Age Range']
};

const RatesWorkspace = () => {
  const { themeMode } = useLayoutContext();
  const shellStyles = useMemo(() => buildShellStyles(themeMode === 'light'), [themeMode]);
  const [activeTab, setActiveTab] = useState('bucket-pricing');
  const [selectedRowIndex, setSelectedRowIndex] = useState(3);
  const { trips } = useNemtContext();
  const tableConfig = RATE_TABLES[activeTab];
  const billingSummary = useMemo(() => {
    const billableTrips = trips.filter(isTripBillable);
    const completedTrips = billableTrips.filter(trip => String(trip.status || '').toLowerCase() === 'completed');
    const pendingTrips = billableTrips.filter(trip => String(trip.status || '').toLowerCase() !== 'completed');
    return {
      billableTrips: billableTrips.length,
      completedTrips: completedTrips.length,
      pendingTrips: pendingTrips.length,
      capturedRevenue: completedTrips.reduce((sum, trip) => sum + getTripBillingAmount(trip), 0),
      pendingRevenue: pendingTrips.reduce((sum, trip) => sum + getTripBillingAmount(trip), 0)
    };
  }, [trips]);

  const rows = useMemo(() => tableConfig.rows, [tableConfig.rows]);

  return <Card className="border-0 shadow-sm overflow-hidden">
      <div className="d-flex align-items-center justify-content-between px-3 py-2 text-white" style={shellStyles.windowHeader}>
        <strong>Rates</strong>
        <button type="button" className="btn btn-link text-white p-0 text-decoration-none">
          <IconifyIcon icon="iconoir:xmark" className="fs-18" />
        </button>
      </div>
      <CardBody className="p-2" style={shellStyles.body}>
        <Row className="g-2 mb-3">
          {[{
            label: 'Trips In Billing',
            value: billingSummary.billableTrips,
            detail: `${billingSummary.completedTrips} completed | ${billingSummary.pendingTrips} pending`
          }, {
            label: 'Revenue Captured',
            value: `$${billingSummary.capturedRevenue.toFixed(2)}`,
            detail: 'Completed billed trips'
          }, {
            label: 'Pending Billing',
            value: `$${billingSummary.pendingRevenue.toFixed(2)}`,
            detail: 'Trips ready to bill'
          }].map(card => <Col md={4} key={card.label}><div className="rounded-3 p-3 h-100" style={{ backgroundColor: themeMode === 'light' ? '#f8f9fb' : '#101521', border: `1px solid ${themeMode === 'light' ? '#d5deea' : '#2a3144'}`, color: themeMode === 'light' ? '#0f172a' : '#e6ecff' }}><div className="small text-secondary text-uppercase">{card.label}</div><div className="fs-4 fw-semibold mt-2">{card.value}</div><div className="small text-secondary mt-1">{card.detail}</div></div></Col>)}
        </Row>

        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
          <Button className="rounded-pill" style={shellStyles.inactiveTab}>
            <IconifyIcon icon="iconoir:refresh-double" />
          </Button>
          <div className="vr text-secondary mx-1" />
          <Button className="rounded-pill" style={shellStyles.primaryPill}>
            <IconifyIcon icon="iconoir:nav-arrow-down" className="me-2" />Private
            <span className="mx-3">-</span>
            11/23/2025
          </Button>
          <div className="vr text-secondary mx-1" />
          {TABS.map(tab => <Button key={tab.key} className="rounded-pill" style={activeTab === tab.key ? shellStyles.activeTab : shellStyles.inactiveTab} onClick={() => {
          setActiveTab(tab.key);
          setSelectedRowIndex(0);
        }}>
              {tab.label}
            </Button>)}
          <div className="vr text-secondary mx-1" />
          {(actionButtonsByTab[activeTab] ?? []).map(label => <Button key={label} className="rounded-pill" style={shellStyles.inactiveTab}>
                <IconifyIcon icon={label.includes('LOS') ? 'iconoir:plus-circle' : 'iconoir:calculator'} className="me-2" />{label}
              </Button>)}
          <Button className="rounded-pill" style={shellStyles.inactiveTab}>
            <IconifyIcon icon="iconoir:dollar-circle" className="me-2" />Costs
          </Button>
          <div className="ms-auto" />
          <Button className="rounded-circle d-flex align-items-center justify-content-center p-0" style={{ ...shellStyles.inactiveTab, width: 34, height: 34 }}>
            <IconifyIcon icon="iconoir:question-mark-circle" />
          </Button>
        </div>

        <div className="border overflow-hidden rounded-2" style={shellStyles.tableShell}>
          <div className="table-responsive" style={{ minHeight: 600, maxHeight: 600 }}>
            <Table className="align-middle mb-0" style={{ color: shellStyles.rowTextColor }}>
              <thead style={shellStyles.tableHead}>
                <tr>
                  <th style={{ ...shellStyles.tableHeadCell, width: 38 }} />
                  {tableConfig.columns.map(column => <th key={column} style={shellStyles.tableHeadCell}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                const isSelected = index === selectedRowIndex || row.selected;
                return <tr key={`${row.label}-${index}`} onClick={() => setSelectedRowIndex(index)} style={{ cursor: 'pointer', backgroundColor: isSelected ? shellStyles.rowBackground.selected : shellStyles.rowBackground.default, color: shellStyles.rowTextColor }}>
                      <td className="text-danger fw-bold">×</td>
                      <td>{row.label}</td>
                      {row.values.map((value, valueIndex) => <td key={`${row.label}-${valueIndex}`}>{value}</td>)}
                    </tr>;
              })}
              </tbody>
            </Table>
          </div>
        </div>
      </CardBody>
    </Card>;
};

export default RatesWorkspace;