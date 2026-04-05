import BrandImage from '@/components/BrandImage';

const PortalMark = ({ size = 72, showWordmark = false, textColor = '#e6f4f7' }) => {
  return <div className="d-inline-flex align-items-center gap-3">
      <BrandImage target="authPortalMark" alt="Florida Mobility Group icon" width={size} height={size} style={{ borderRadius: Math.max(18, Math.round(size * 0.28)), objectFit: 'cover' }} />
      {showWordmark ? <div>
          <div className="fw-semibold" style={{ color: textColor, letterSpacing: '0.08em', fontSize: 12, textTransform: 'uppercase' }}>Florida Mobility Group</div>
          <div className="fw-bold" style={{ color: textColor, fontSize: 28, lineHeight: 1.05 }}>Operations Portal</div>
        </div> : null}
    </div>;
};

export default PortalMark;