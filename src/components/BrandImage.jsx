'use client';

import { BRANDING_PAGE_KEYS, DEFAULT_BRANDING_SETTINGS, resolveBrandingImage } from '@/helpers/branding';
import useBrandingApi from '@/hooks/useBrandingApi';
import { useEffect, useMemo, useState } from 'react';

const appendCacheVersion = (value, version) => {
  const src = String(value || '').trim();
  const cacheVersion = String(version || '').trim();
  if (!src || !cacheVersion || src.startsWith('data:')) return src;
  return `${src}${src.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheVersion)}`;
};

const BrandImage = ({
  kind = 'login',
  target,
  alt = 'Florida Mobility Group logo',
  className,
  style,
  width,
  height,
  fallbackSrc,
  onClick
}) => {
  const { data, eventName } = useBrandingApi();
  const resolvedTarget = target || (kind === 'app' ? BRANDING_PAGE_KEYS.portalSidebar : BRANDING_PAGE_KEYS.authLogin);
  const defaultSrc = fallbackSrc || resolveBrandingImage(DEFAULT_BRANDING_SETTINGS, resolvedTarget);
  const branding = data?.branding;
  const resolvedSrc = useMemo(() => {
    return resolveBrandingImage(branding, resolvedTarget) || defaultSrc;
  }, [branding, defaultSrc, resolvedTarget]);
  // Initialize from resolvedSrc so if branding is already module-cached (soft nav), no flash occurs.
  const [src, setSrc] = useState(() => resolvedSrc);
  const versionedSrc = useMemo(() => appendCacheVersion(src || defaultSrc, branding?.updatedAt), [branding?.updatedAt, defaultSrc, src]);

  useEffect(() => {
    setSrc(resolvedSrc || defaultSrc);
  }, [defaultSrc, resolvedSrc]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleBrandingUpdated = event => {
      const nextBranding = event?.detail;
      if (!nextBranding) return;
      setSrc(resolveBrandingImage(nextBranding, resolvedTarget) || defaultSrc);
    };
    window.addEventListener(eventName, handleBrandingUpdated);
    return () => window.removeEventListener(eventName, handleBrandingUpdated);
  }, [defaultSrc, eventName, resolvedTarget]);

  const handleError = () => {
    if (!defaultSrc || src === defaultSrc) return;
    setSrc(defaultSrc);
  };

  return <img src={versionedSrc || defaultSrc} alt={alt} className={className} style={style} width={width} height={height} onClick={onClick} onError={handleError} />;
};

export default BrandImage;