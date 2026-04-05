'use client';

import { BRANDING_PAGE_KEYS, DEFAULT_BRANDING_SETTINGS, resolveBrandingImage } from '@/helpers/branding';
import useBrandingApi from '@/hooks/useBrandingApi';
import { useEffect, useMemo, useState } from 'react';

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
  const [src, setSrc] = useState(defaultSrc);

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

  return <img src={src || defaultSrc} alt={alt} className={className} style={style} width={width} height={height} onClick={onClick} />;
};

export default BrandImage;