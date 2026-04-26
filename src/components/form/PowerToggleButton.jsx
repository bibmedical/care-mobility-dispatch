'use client';

import clsx from 'clsx';
import IconifyIcon from '../wrappers/IconifyIcon';

const SIZE_MAP = {
  xs: {
    width: 58,
    height: 30,
    thumb: 24,
    padding: 3,
    fontSize: '0.62rem',
    iconSize: 13
  },
  sm: {
    width: 76,
    height: 40,
    thumb: 32,
    padding: 4,
    fontSize: '0.72rem',
    iconSize: 16
  },
  md: {
    width: 92,
    height: 48,
    thumb: 38,
    padding: 5,
    fontSize: '0.78rem',
    iconSize: 18
  },
  lg: {
    width: 108,
    height: 56,
    thumb: 44,
    padding: 6,
    fontSize: '0.84rem',
    iconSize: 20
  }
};

const OFF_VARIANTS = {
  neutral: {
    background: 'linear-gradient(180deg, #efefef 0%, #dcdcdc 100%)',
    borderColor: 'rgba(148, 163, 184, 0.65)',
    iconColor: '#c7c7c7',
    labelColor: '#7c7c7c'
  },
  danger: {
    background: 'linear-gradient(180deg, #ff6558 0%, #f23e30 100%)',
    borderColor: 'rgba(220, 38, 38, 0.46)',
    iconColor: '#ef4444',
    labelColor: '#fff5f5'
  }
};

const getTrackStyle = ({
  checked,
  disabled,
  offVariant,
  sizeConfig
}) => {
  const offTone = OFF_VARIANTS[offVariant] || OFF_VARIANTS.neutral;

  return {
    width: sizeConfig.width,
    height: sizeConfig.height,
    borderRadius: sizeConfig.height / 2,
    padding: sizeConfig.padding,
    border: `1px solid ${checked ? 'rgba(22, 163, 74, 0.34)' : offTone.borderColor}`,
    background: checked ? 'linear-gradient(180deg, #18dd73 0%, #53eb73 100%)' : offTone.background,
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: checked ? 'flex-start' : 'flex-end',
    boxShadow: checked ? 'inset 0 1px 2px rgba(255,255,255,0.35), 0 8px 18px rgba(34, 197, 94, 0.22)' : 'inset 0 1px 2px rgba(255,255,255,0.6), 0 8px 18px rgba(15, 23, 42, 0.08)',
    transition: 'background 180ms ease, border-color 180ms ease, box-shadow 180ms ease, opacity 180ms ease',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    userSelect: 'none'
  };
};

const getThumbStyle = ({
  checked,
  offVariant,
  sizeConfig
}) => {
  const offTone = OFF_VARIANTS[offVariant] || OFF_VARIANTS.neutral;

  return {
    width: sizeConfig.thumb,
    height: sizeConfig.thumb,
    minWidth: sizeConfig.thumb,
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    border: `1px solid ${checked ? 'rgba(34, 197, 94, 0.35)' : 'rgba(203, 213, 225, 0.88)'}`,
    boxShadow: '0 3px 10px rgba(15, 23, 42, 0.18)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: checked ? '#22c55e' : offTone.iconColor,
    transform: checked ? 'translateX(0)' : 'translateX(0)',
    transition: 'color 180ms ease, border-color 180ms ease, transform 180ms ease'
  };
};

const getLabelStyle = ({
  checked,
  offVariant,
  sizeConfig
}) => {
  const offTone = OFF_VARIANTS[offVariant] || OFF_VARIANTS.neutral;

  return {
    position: 'absolute',
    left: checked ? sizeConfig.padding + 10 : 14,
    right: checked ? 14 : sizeConfig.padding + 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: checked ? 'flex-start' : 'flex-end',
    pointerEvents: 'none',
    fontSize: sizeConfig.fontSize,
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: checked ? '#ecfdf5' : offTone.labelColor,
    textTransform: 'uppercase'
  };
};

const PowerToggleButton = ({
  checked = false,
  disabled = false,
  offVariant = 'neutral',
  size = 'md',
  onClick,
  onToggle,
  onLabel = 'On',
  offLabel = 'Off',
  className,
  style,
  id,
  name,
  ...rest
}) => {
  const sizeConfig = SIZE_MAP[size] || SIZE_MAP.md;
  const label = checked ? onLabel : offLabel;

  const handleClick = event => {
    if (disabled) return;
    onClick?.(event);
    onToggle?.(!checked, event);
  };

  return <button
      {...rest}
      id={id}
      name={name}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={String(rest['aria-label'] || label)}
      disabled={disabled}
      onClick={handleClick}
      className={clsx('border-0 bg-transparent p-0 d-inline-flex align-items-center', className)}
      style={style}>
      <span style={getTrackStyle({ checked, disabled, offVariant, sizeConfig })}>
        <span style={getLabelStyle({ checked, offVariant, sizeConfig })}>{label}</span>
        <span style={getThumbStyle({ checked, offVariant, sizeConfig })}>
          <IconifyIcon icon={checked ? 'iconoir:check' : 'iconoir:xmark'} width={sizeConfig.iconSize} height={sizeConfig.iconSize} />
        </span>
      </span>
    </button>;
};

export default PowerToggleButton;