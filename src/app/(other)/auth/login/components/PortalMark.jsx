const PortalMark = ({ size = 72, showWordmark = false, textColor = '#e6f4f7' }) => {
  return <div className="d-inline-flex align-items-center gap-3">
      <svg width={size} height={size} viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="portalMarkBg" x1="10" y1="8" x2="76" y2="82" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1ED6D1" />
            <stop offset="1" stopColor="#1570A6" />
          </linearGradient>
          <linearGradient id="portalMarkRoad" x1="29" y1="25" x2="64" y2="67" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F8FBFF" />
            <stop offset="1" stopColor="#D7E9F7" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="80" height="80" rx="24" fill="#071A2A" />
        <path d="M67 21.5C61.6 16.3 53.7 13 44.9 13C28.7 13 15.7 24.5 13.5 39.8H26.7C28.8 31.7 36.2 25.7 45 25.7C50.1 25.7 54.8 27.6 58.4 30.8L67 21.5Z" fill="url(#portalMarkBg)" />
        <path d="M20.6 48.2C22.6 60.3 32.9 69.6 45.6 69.6C55.8 69.6 64.6 63.7 68.8 55.1H55.1C52.6 57.7 49.1 59.3 45.2 59.3C38.1 59.3 32.1 54.3 30.6 47.5L20.6 48.2Z" fill="url(#portalMarkBg)" opacity="0.92" />
        <path d="M28 62L43.2 26H59L43.8 62H28Z" fill="url(#portalMarkRoad)" />
        <path d="M39.2 53.9L47.7 34.1" stroke="#5A5A9B" strokeWidth="3.2" strokeLinecap="round" strokeDasharray="3.8 5.5" />
        <path d="M54.3 24.3H63.1L47.2 61.9H38.6L54.3 24.3Z" fill="#5A5A9B" opacity="0.88" />
      </svg>
      {showWordmark ? <div>
          <div className="fw-semibold" style={{ color: textColor, letterSpacing: '0.08em', fontSize: 12, textTransform: 'uppercase' }}>Care Mobility</div>
          <div className="fw-bold" style={{ color: textColor, fontSize: 28, lineHeight: 1.05 }}>Operations Portal</div>
        </div> : null}
    </div>;
};

export default PortalMark;