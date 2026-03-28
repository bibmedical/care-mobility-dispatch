export const MENU_ITEMS = [{
  key: 'operations',
  label: 'Operations',
  isTitle: true
}, {
  key: 'dispatcher',
  icon: 'iconoir:report-columns',
  label: 'Dispatcher',
  url: '/dispatcher'
}, {
  key: 'trip-analytics',
  label: 'Primary Dashboard',
  icon: 'iconoir:stats-report',
  url: '/trip-analytics'
}, {
  key: 'trip-dashboard',
  label: 'Trip Dashboard',
  icon: 'iconoir:view-grid',
  url: '/trip-dashboard'
}, {
  key: 'excel-loader',
  label: 'Excel Loader',
  icon: 'iconoir:page-search',
  url: '/forms-safe-ride-import'
}, {
  key: 'settings',
  label: 'Settings',
  isTitle: true
}, {
  key: 'user-management',
  label: 'User Management',
  icon: 'iconoir:user-scan',
  url: '/user-management'
}, {
  key: 'drivers-menu',
  label: 'Drivers',
  icon: 'iconoir:user',
  children: [{
    key: 'drivers',
    label: 'Drivers',
    url: '/drivers'
  }, {
    key: 'drivers-attendants',
    label: 'Attendants',
    url: '/drivers/attendants'
  }, {
    key: 'drivers-vehicles',
    label: 'Vehicles',
    url: '/drivers/vehicles'
  }, {
    key: 'drivers-grouping',
    label: 'Grouping',
    url: '/drivers/grouping'
  }]
}, {
  key: 'preferences',
  label: 'Preferences',
  icon: 'iconoir:settings',
  url: '/preferences'
}, {
  key: 'integrations-menu',
  label: 'Integrations',
  icon: 'iconoir:plug-type-a',
  children: [{
    key: 'integrations-uber',
    label: 'Uber',
    url: '/integrations/uber'
  }]
}, {
  key: 'rates',
  label: 'Rates',
  icon: 'iconoir:dollar-circle',
  url: '/rates'
}, {
  key: 'logs',
  label: 'Logs',
  isTitle: true
}, {
  key: 'system-logs',
  label: 'System Logs',
  icon: 'iconoir:list-select',
  url: '/system-logs'
}, {
  key: 'system-messages',
  label: 'System Messages',
  icon: 'iconoir:message-text',
  url: '/system-messages'
}, {
  key: 'reports',
  label: 'Reports',
  isTitle: true
}, {
  key: 'full-shift-analysis',
  label: 'Full Shift Analysis',
  icon: 'iconoir:graph-up',
  url: '/full-shift-analysis'
}, {
  key: 'daily-driver-snapshot',
  label: 'Daily Driver Snapshot',
  icon: 'iconoir:camera',
  url: '/daily-driver-snapshot'
}, {
  key: 'driver-efficiency-report',
  label: 'Driver Efficiency Report',
  icon: 'iconoir:stats-report',
  url: '/driver-efficiency-report'
}, {
  key: 'help',
  label: 'Help',
  icon: 'iconoir:help-circle',
  url: '/help'
}, {
  key: 'logoff',
  label: 'LogOff',
  icon: 'iconoir:log-out',
  url: '/auth/login'
}];