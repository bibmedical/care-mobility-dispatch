'use client';

import { useMemo, useState } from 'react';
import { Badge, Button } from 'react-bootstrap';

export const AVAILABLE_VEHICLE_ICONS = Array.from({ length: 20 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0');
  return {
    label: `Car ${number}`,
    value: `/assets/gpscars/car-${number}.svg`
  };
});

const normalizeVehicleIconPath = value => {
  const raw = String(value || '').trim();
  return raw ? `/${raw.replace(/^\/+/, '')}` : '';
};

const VehicleIconSelector = ({
  value,
  onChange,
  onApplyToAll,
  applying = false,
  showApplyButton = true
}) => {
  const [imageErrorByValue, setImageErrorByValue] = useState({});
  const selectedValue = normalizeVehicleIconPath(value) || AVAILABLE_VEHICLE_ICONS[0].value;
  const selectedIcon = useMemo(() => AVAILABLE_VEHICLE_ICONS.find(icon => icon.value === selectedValue) || AVAILABLE_VEHICLE_ICONS[0], [selectedValue]);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <div>
          <div className="fw-semibold">Vehicle Icon</div>
          <div className="small text-secondary">Choose the car used on live GPS maps.</div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Badge bg="dark">{selectedIcon.label}</Badge>
          {showApplyButton ? (
            <Button
              variant="success"
              size="sm"
              disabled={applying || !onApplyToAll}
              onClick={() => onApplyToAll?.(selectedValue)}
            >
              {applying ? 'Applying...' : 'Apply to All Drivers'}
            </Button>
          ) : null}
        </div>
      </div>

      <div
        className="d-grid gap-2"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))' }}
      >
        {AVAILABLE_VEHICLE_ICONS.map(icon => {
          const selected = icon.value === selectedValue;
          const hasError = imageErrorByValue[icon.value];
          return (
            <button
              key={icon.value}
              type="button"
              className={`btn ${selected ? 'btn-primary' : 'btn-outline-secondary'} p-2`}
              onClick={() => onChange?.(icon.value)}
              aria-pressed={selected}
              title={icon.label}
              style={{ minHeight: 96 }}
            >
              <div className="d-flex align-items-center justify-content-center" style={{ height: 58 }}>
                {hasError ? (
                  <span className="small text-muted">No image</span>
                ) : (
                  <img
                    src={icon.value}
                    alt={icon.label}
                    style={{ width: 74, height: 54, objectFit: 'contain' }}
                    onError={() => setImageErrorByValue(current => ({ ...current, [icon.value]: true }))}
                  />
                )}
              </div>
              <div className="small fw-semibold text-truncate">{icon.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default VehicleIconSelector;