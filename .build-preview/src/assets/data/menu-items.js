export const MENU_ITEMS = [{
  key: 'operations',
  label: 'Operations',
  isTitle: true
}, {
  key: 'transportation-title',
  label: 'Transportation',
  isTitle: true
}, {
  key: 'fuel-requests-menu',
  label: 'Fuel Requests',
  icon: 'iconoir:gas-tank',
  url: '/fuel-requests'
}, {
  key: 'transportation-menu',
  label: 'Transportation',
  icon: 'iconoir:bus',
  children: [{
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
    key: 'configuraciones-page-memory',
    label: 'Page Memory',
    url: '/settings/page-memory'
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
  key: 'logoff',
  label: 'LogOff',
  icon: 'iconoir:log-out',
  url: '/auth/login'
}];