export const MENU_ITEMS = [{
  key: 'operations',
  label: 'Operations',
  isTitle: true
}, {
  key: 'dispatcher-menu',
  icon: 'iconoir:report-columns',
  label: 'Dispatcher',
  children: [{
    key: 'trip-dashboard-blacklist',
    label: 'Black List',
    url: '/blacklist'
  }, {
    key: 'dispatcher-history',
    label: 'History',
    url: '/dispatcher/history'
  }, {
    key: 'dispatcher-live',
    label: 'Live Board',
    url: '/dispatcher'
  }]
}, {
  key: 'trip-dashboard',
  label: 'Trip Dashboard',
  icon: 'iconoir:view-grid',
  children: [{
    key: 'trip-dashboard-confirmation',
    label: 'Confirmation',
    url: '/confirmation'
  }, {
    key: 'excel-loader-inner',
    label: 'Excel Loader',
    url: '/forms-safe-ride-import'
  }, {
    key: 'trip-dashboard-main',
    label: 'Trip Dashboard',
    url: '/trip-dashboard'
  }]
}, {
  key: 'transportation-title',
  label: 'Transportation',
  isTitle: true
}, {
  key: 'transportation-menu',
  label: 'Transportation',
  icon: 'iconoir:bus',
  children: [{
    key: 'drivers-menu-inner',
    label: 'Drivers',
    url: '/drivers'
  }, {
    key: 'vehicles-inner',
    label: 'Vehicles',
    url: '/drivers/vehicles'
  }]
}, {
  key: 'users-menu',
  label: 'Users',
  icon: 'iconoir:community',
  children: [{
    key: 'avatar',
    label: 'Avatar',
    url: '/avatar'
  }, {
    key: 'user-management',
    label: 'User Management',
    url: '/user-management'
  }]
}, {
  key: 'billing-title',
  label: 'Billing',
  isTitle: true
}, {
  key: 'billing',
  label: 'Billing',
  icon: 'iconoir:dollar-circle',
  children: [{
    key: 'billing-main',
    label: 'Billing',
    url: '/billing'
  }, {
    key: 'billing-rates',
    label: 'Rates',
    url: '/rates'
  }]
}, {
  key: 'configuraciones-menu',
  label: 'Settings',
  icon: 'iconoir:settings',
  children: [{
    key: 'configuraciones-email-templates',
    label: 'Email Templates',
    url: '/settings/email-templates'
  }, {
    key: 'configuraciones-gps',
    label: 'GPS',
    url: '/settings/gps'
  }, {
    key: 'configuraciones-office',
    label: 'Office',
    url: '/settings/office'
  }]
}, {
  key: 'integrations-menu',
  label: 'Integrations',
  icon: 'iconoir:plug-type-a',
  children: [{
    key: 'integrations-ai',
    label: 'AI',
    url: '/integrations/ai'
  }, {
    key: 'integrations-sms',
    label: 'SMS',
    url: '/integrations/sms'
  }]
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