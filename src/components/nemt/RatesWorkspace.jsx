'use client';

import IconifyIcon from '@/components/wrappers/IconifyIcon';
import React, { useMemo, useState } from 'react';
import { Button, Card, CardBody, Form, Table } from 'react-bootstrap';

const shellStyles = {
  windowHeader: {
    backgroundColor: '#23324a'
  },
  body: {
    backgroundColor: '#171b27'
  },
  toolbarButton: {
    backgroundColor: '#101521',
    borderColor: '#2a3144',
    color: '#e6ecff'
  },
  primaryPill: {
    backgroundColor: '#2f60c9',
    borderColor: '#2f60c9',
    color: '#fff'
  },
  activeTab: {
    backgroundColor: '#8dc63f',
    borderColor: '#8dc63f',
    color: '#fff'
  },
  inactiveTab: {
    backgroundColor: '#f6f7fb',
    borderColor: '#cfd6e4',
    color: '#08131a'
  },
  tableShell: {
    borderColor: '#2a3144',
    backgroundColor: '#171b27'
  },
  tableHead: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    backgroundColor: '#8dc63f',
    color: '#fff'
  },
  tableHeadCell: {
    backgroundColor: '#8dc63f',
    color: '#fff',
    borderColor: 'rgba(255,255,255,0.2)',
    fontWeight: 400
  }
};

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

const rateTables = {
  'bucket-pricing': {
    columns: ['Distance (mi)', 'A', 'W', 'EP', 'E8', 'S', 'APEC', 'WPEC', 'GT', 'SGT'],
    rows: [{
      label: '00-03',
      values: ['9.50', '19.00', '6.65', '13.30', '60.00', '10.21', '19.75', '6.65', '13.30']
    }, {
      label: '04-06',
      values: ['12.25', '22.00', '8.58', '15.40', '65.00', '13.00', '22.50', '8.58', '15.40']
    }, {
      label: '07-10',
      values: ['16.30', '26.00', '11.41', '18.20', '70.00', '16.25', '26.50', '11.41', '18.20']
    }, {
      label: 'Each Additional Miles',
      values: ['1.63', '1.95', '1.14', '1.37', '2.00', '1.63', '1.95', '1.14', '1.37'],
      selected: true
    }]
  },
  'standard-pricing': {
    columns: ['Distance (mi)', 'A', 'W', 'EP', 'E8', 'S', 'APEC', 'WPEC', 'GT', 'SGT'],
    rows: [{
      label: 'Seating',
      values: ['13.50', '0.00', '0.00', '0.00', '10.00', '0.00', '0.00', '0.00', '0.00']
    }, {
      label: '1-1',
      values: ['10.00', '3.00', '2.00', '2.00', '1.50', '1.50', '1.50', '1.50', '0.00']
    }, {
      label: '2-2',
      values: ['5.00', '3.00', '2.00', '2.00', '2.00', '2.00', '2.00', '2.00', '0.00']
    }, {
      label: '3-3',
      values: ['3.33', '0.00', '0.00', '0.00', '1.00', '0.00', '0.00', '0.00', '0.00']
    }, {
      label: '4-4',
      values: ['2.50', '0.00', '0.00', '0.00', '2.00', '0.00', '0.00', '0.00', '0.00']
    }, {
      label: '5-5',
      values: ['2.00', '0.00', '0.00', '0.00', '3.00', '0.00', '0.00', '0.00', '0.00'],
      selected: true
    }, {
      label: '6-500',
      values: ['2.00', '0.00', '0.00', '0.00', '50.00', '0.00', '0.00', '0.00', '0.00']
    }, {
      label: 'Each Additional Mile!',
      values: ['2.00', '3.00', '2.00', '2.00', '2.00', '2.00', '2.00', '2.00', '0.00']
    }]
  },
  'los-types': {
    columns: ['LOS', 'Target', 'Switch', 'Free Miles', 'Time Before (PU)', 'Price', 'Time After (PU)', 'Price', 'Escort', 'Attendant'],
    rows: ['A', 'W', 'EP', 'E8', 'S', 'APEC', 'WPEC', 'GT', 'SGT'].map(label => ({
      label,
      values: ['Bucket', '', '', '--:--', '', '--:--', '', '', ''],
      selected: label === 'S'
    }))
  },
  'age-buckets': {
    columns: ['Age Buckets (years)', 'Age Pricing'],
    rows: [{
      label: '0-0',
      values: ['0.00']
    }]
  }
};

const actionButtonsByTab = {
  'bucket-pricing': ['Add Distance'],
  'standard-pricing': ['Add Distance'],
  'los-types': ['Add LOS'],
  'age-buckets': ['Add Age Range']
};

const RatesWorkspace = () => {
  const [activeTab, setActiveTab] = useState('bucket-pricing');
  const [selectedRowIndex, setSelectedRowIndex] = useState(3);
  const tableConfig = rateTables[activeTab];

  const rows = useMemo(() => tableConfig.rows, [tableConfig.rows]);

  return <Card className="border-0 shadow-sm overflow-hidden">
      <div className="d-flex align-items-center justify-content-between px-3 py-2 text-white" style={shellStyles.windowHeader}>
        <strong>Rates</strong>
        <button type="button" className="btn btn-link text-white p-0 text-decoration-none">
          <IconifyIcon icon="iconoir:xmark" className="fs-18" />
        </button>
      </div>
      <CardBody className="p-2" style={shellStyles.body}>
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
            <Table className="align-middle mb-0 text-white">
              <thead style={shellStyles.tableHead}>
                <tr>
                  <th style={{ ...shellStyles.tableHeadCell, width: 38 }} />
                  {tableConfig.columns.map(column => <th key={column} style={shellStyles.tableHeadCell}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                const isSelected = index === selectedRowIndex || row.selected;
                return <tr key={`${row.label}-${index}`} onClick={() => setSelectedRowIndex(index)} style={{ cursor: 'pointer', backgroundColor: isSelected ? '#202c42' : '#171b27', color: '#e6ecff' }}>
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