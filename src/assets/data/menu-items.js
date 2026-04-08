export const MENU_ITEMS = [{
  key: 'operations',
  label: 'Operations',
  isTitle: true
}, {
  key: 'dispatcher-menu',
  icon: 'iconoir:report-columns',
  label: 'Dispatcher',
  children: [{
    key: 'dispatcher-live',
    label: 'Live Board',
    url: '/dispatcher'
  }, {
    key: 'dispatcher-history',
    label: 'History',
    url: '/dispatcher/history'
  }]
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
  key: 'confirmation',
  label: 'Confirmation',
  icon: 'iconoir:check-circle',
  url: '/confirmation'
}, {
  key: 'blacklist',
  label: 'Black List',
  icon: 'iconoir:shield-question',
  url: '/blacklist'
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
    key: 'drivers-grouping',
    label: 'Grouping',
    url: '/drivers/grouping'
  }]
}, {
  key: 'vehicles',
  label: 'Vehicles',
  icon: 'iconoir:truck',
  url: '/drivers/vehicles'
}, {
  key: 'configuraciones-menu',
  label: 'Settings',
  icon: 'iconoir:settings-system',
  children: [{
    key: 'configuraciones-office',
    label: 'Office',
    url: '/settings/office'
  }, {
    key: 'configuraciones-email-templates',
    label: 'Email Templates',
    url: '/settings/email-templates'
  }, {
    key: 'preferences',
    label: 'Logo',
    url: '/preferences'
  }, {
    key: 'avatar',
    label: 'Avatar',
    url: '/avatar'
  }]
}, {
  key: 'integrations-menu',
  label: 'Integrations',
  icon: 'iconoir:plug-type-a',
  children: [{
    key: 'integrations-uber',
    label: 'Uber',
    url: '/integrations/uber'
  }, {
    key: 'integrations-ai',
    label: 'AI',
    url: '/integrations/ai'
  }, {
    key: 'integrations-sms',
    label: 'SMS',
    url: '/integrations/sms'
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