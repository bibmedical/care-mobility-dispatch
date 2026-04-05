export const BRANDING_PAGE_KEYS = {
  authLogin: 'authLogin',
  authReset: 'authReset',
  authRegister: 'authRegister',
  authLockScreen: 'authLockScreen',
  authPortalMark: 'authPortalMark',
  portalSidebar: 'portalSidebar',
  error404: 'error404',
  error500: 'error500'
};

export const BRANDING_PAGE_OPTIONS = [{
  key: BRANDING_PAGE_KEYS.authLogin,
  label: 'Login page',
  group: 'Auth'
}, {
  key: BRANDING_PAGE_KEYS.authReset,
  label: 'Reset password',
  group: 'Auth'
}, {
  key: BRANDING_PAGE_KEYS.authRegister,
  label: 'Register',
  group: 'Auth'
}, {
  key: BRANDING_PAGE_KEYS.authLockScreen,
  label: 'Lock screen',
  group: 'Auth'
}, {
  key: BRANDING_PAGE_KEYS.authPortalMark,
  label: 'Portal mark',
  group: 'Auth'
}, {
  key: BRANDING_PAGE_KEYS.portalSidebar,
  label: 'Sidebar logo',
  group: 'Portal'
}, {
  key: BRANDING_PAGE_KEYS.error404,
  label: '404 page',
  group: 'Errors'
}, {
  key: BRANDING_PAGE_KEYS.error500,
  label: '500 page',
  group: 'Errors'
}];

export const DEFAULT_BRANDING_PAGES = {
  [BRANDING_PAGE_KEYS.authLogin]: '/fmg-login-logo.png',
  [BRANDING_PAGE_KEYS.authReset]: '/fmg-login-logo.png',
  [BRANDING_PAGE_KEYS.authRegister]: '/fmg-login-logo.png',
  [BRANDING_PAGE_KEYS.authLockScreen]: '/fmg-login-logo.png',
  [BRANDING_PAGE_KEYS.authPortalMark]: '/fmg-app-icon.png',
  [BRANDING_PAGE_KEYS.portalSidebar]: '/fmg-app-icon.png',
  [BRANDING_PAGE_KEYS.error404]: '/fmg-login-logo.png',
  [BRANDING_PAGE_KEYS.error500]: '/fmg-login-logo.png'
};

const DEFAULT_COMBINATION_ID = 'default';

export const DEFAULT_BRANDING_SETTINGS = {
  loginLogo: DEFAULT_BRANDING_PAGES.authLogin,
  appLogo: DEFAULT_BRANDING_PAGES.portalSidebar,
  pages: {
    ...DEFAULT_BRANDING_PAGES
  },
  combinations: [{
    id: DEFAULT_COMBINATION_ID,
    name: 'Default FMG',
    pages: {
      ...DEFAULT_BRANDING_PAGES
    },
    updatedAt: ''
  }],
  activeCombinationId: DEFAULT_COMBINATION_ID,
  updatedAt: ''
};

const normalizeImageValue = value => String(value || '').trim();

const normalizePages = value => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(BRANDING_PAGE_OPTIONS.map(option => [option.key, normalizeImageValue(source[option.key]) || DEFAULT_BRANDING_PAGES[option.key]]));
};

const normalizeCombination = value => ({
  id: String(value?.id || '').trim() || `combo-${Date.now()}`,
  name: String(value?.name || '').trim() || 'Custom combination',
  pages: normalizePages(value?.pages),
  updatedAt: String(value?.updatedAt || '')
});

export const normalizeBrandingSettings = value => ({
  loginLogo: normalizeImageValue(value?.loginLogo) || normalizeImageValue(value?.pages?.[BRANDING_PAGE_KEYS.authLogin]) || DEFAULT_BRANDING_SETTINGS.loginLogo,
  appLogo: normalizeImageValue(value?.appLogo) || normalizeImageValue(value?.pages?.[BRANDING_PAGE_KEYS.portalSidebar]) || DEFAULT_BRANDING_SETTINGS.appLogo,
  pages: (() => {
    const normalizedPages = normalizePages({
      ...value?.pages,
      [BRANDING_PAGE_KEYS.authLogin]: normalizeImageValue(value?.pages?.[BRANDING_PAGE_KEYS.authLogin]) || normalizeImageValue(value?.loginLogo),
      [BRANDING_PAGE_KEYS.authReset]: normalizeImageValue(value?.pages?.[BRANDING_PAGE_KEYS.authReset]) || normalizeImageValue(value?.loginLogo),
      [BRANDING_PAGE_KEYS.authRegister]: normalizeImageValue(value?.pages?.[BRANDING_PAGE_KEYS.authRegister]) || normalizeImageValue(value?.loginLogo),
      [BRANDING_PAGE_KEYS.authLockScreen]: normalizeImageValue(value?.pages?.[BRANDING_PAGE_KEYS.authLockScreen]) || normalizeImageValue(value?.loginLogo),
      [BRANDING_PAGE_KEYS.error404]: normalizeImageValue(value?.pages?.[BRANDING_PAGE_KEYS.error404]) || normalizeImageValue(value?.loginLogo),
      [BRANDING_PAGE_KEYS.error500]: normalizeImageValue(value?.pages?.[BRANDING_PAGE_KEYS.error500]) || normalizeImageValue(value?.loginLogo),
      [BRANDING_PAGE_KEYS.authPortalMark]: normalizeImageValue(value?.pages?.[BRANDING_PAGE_KEYS.authPortalMark]) || normalizeImageValue(value?.appLogo),
      [BRANDING_PAGE_KEYS.portalSidebar]: normalizeImageValue(value?.pages?.[BRANDING_PAGE_KEYS.portalSidebar]) || normalizeImageValue(value?.appLogo)
    });
    return normalizedPages;
  })(),
  combinations: (() => {
    const items = Array.isArray(value?.combinations) ? value.combinations.map(normalizeCombination) : [];
    const defaultExists = items.some(item => item.id === DEFAULT_COMBINATION_ID);
    return defaultExists ? items : [DEFAULT_BRANDING_SETTINGS.combinations[0], ...items];
  })(),
  activeCombinationId: String(value?.activeCombinationId || DEFAULT_COMBINATION_ID).trim() || DEFAULT_COMBINATION_ID,
  updatedAt: String(value?.updatedAt || '')
});

export const resolveBrandingImage = (branding, target) => {
  const normalized = normalizeBrandingSettings(branding);
  if (target && normalized.pages[target]) return normalized.pages[target];
  if (target === 'app') return normalized.appLogo;
  return normalized.loginLogo;
};