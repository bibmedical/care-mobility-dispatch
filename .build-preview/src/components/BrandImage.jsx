'use client';

const ICON_TARGETS = new Set(['authPortalMark']);

const BrandImage = ({
	kind = 'login',
	target,
	alt = 'Florida Mobility Group logo',
	className,
	style,
	width,
	height,
	onClick
}) => {
	const normalizedTarget = String(target || '').trim();
	const useIcon = ICON_TARGETS.has(normalizedTarget) || (kind === 'app' && normalizedTarget !== 'portalSidebar');
	const src = useIcon ? '/apk-iconnew-cropped.png' : '/apk-logonew.png';

	return <img src={src} alt={alt} className={className} style={style} width={width} height={height} onClick={onClick} />;
};

export default BrandImage;