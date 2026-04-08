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
  children: []
}, {
  key: 'users-menu',
  label: 'Users',
  icon: 'iconoir:community',
  children: []
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
  icon: 'iconoir:settings-system',
  children: [{
    key: 'avatar',
    label: 'Avatar',
    url: '/avatar'
  }, {
    key: 'drivers-menu-inner',
    label: 'Drivers',
    url: '/drivers'
  }, {
    key: 'configuraciones-email-templates',
    label: 'Email Templates',
    url: '/settings/email-templates'
  }, {
    key: 'preferences',
    label: 'Logo',
    url: '/preferences'
  }, {
    key: 'configuraciones-office',
    label: 'Office',
    url: '/settings/office'
  }, {
    key: 'user-management',
    label: 'User Management',
    url: '/user-management'
  }, {
    key: 'vehicles-inner',
    label: 'Vehicles',
    url: '/drivers/vehicles'
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