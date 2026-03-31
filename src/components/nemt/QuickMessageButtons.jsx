'use client';

import React, { useState } from 'react';
import { Button, ButtonGroup, Tooltip } from 'react-bootstrap';
import IconifyIcon from '@/components/wrappers/IconifyIcon';
import ExtensionMessenger from '@/components/nemt/ExtensionMessenger';

export default function QuickMessageButtons({ driver, size = 'sm', variant = 'outline-secondary' }) {
  const [showMessenger, setShowMessenger] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState(null);

  if (!driver) return null;

  const hasWhatsApp = driver?.phone || driver?.whatsappNumber;
  const hasTelegram = driver?.telegramHandle;
  const hasViber = driver?.viberNumber;
  const hasSignal = driver?.signalNumber;
  const hasSMS = driver?.phone;

  const handleQuickWhatsApp = () => {
    setSelectedMethod('whatsapp');
    setShowMessenger(true);
  };

  const handleQuickTelegram = () => {
    setSelectedMethod('telegram');
    setShowMessenger(true);
  };

  const handleQuickSMS = () => {
    setSelectedMethod('sms');
    setShowMessenger(true);
  };

  return (
    <>
      <ButtonGroup size={size} className="d-flex flex-wrap">
        {hasWhatsApp && (
          <Button
            variant={variant}
            title="Send WhatsApp message"
            onClick={handleQuickWhatsApp}
            className="d-flex align-items-center gap-1"
          >
            <IconifyIcon icon="mdi:whatsapp" className="text-success" />
            {size !== 'sm' && 'WhatsApp'}
          </Button>
        )}
        
        {hasTelegram && (
          <Button
            variant={variant}
            title="Send Telegram message"
            onClick={handleQuickTelegram}
            className="d-flex align-items-center gap-1"
          >
            <IconifyIcon icon="mdi:telegram" className="text-info" />
            {size !== 'sm' && 'Telegram'}
          </Button>
        )}

        {hasViber && (
          <Button
            variant={variant}
            title="Send Viber message"
            onClick={() => { setSelectedMethod('viber'); setShowMessenger(true); }}
            className="d-flex align-items-center gap-1"
          >
            <IconifyIcon icon="mdi:viber" style={{ color: '#7B519C' }} />
            {size !== 'sm' && 'Viber'}
          </Button>
        )}

        {hasSignal && (
          <Button
            variant={variant}
            title="Send Signal message"
            onClick={() => { setSelectedMethod('signal'); setShowMessenger(true); }}
            className="d-flex align-items-center gap-1"
          >
            <IconifyIcon icon="mdi:shield" className="text-primary" />
            {size !== 'sm' && 'Signal'}
          </Button>
        )}

        {hasSMS && (
          <Button
            variant={variant}
            title="Send SMS"
            onClick={handleQuickSMS}
            className="d-flex align-items-center gap-1"
          >
            <IconifyIcon icon="mdi:message-text" className="text-secondary" />
            {size !== 'sm' && 'SMS'}
          </Button>
        )}
      </ButtonGroup>

      {showMessenger && (
        <ExtensionMessenger
          driver={driver}
          initialMethod={selectedMethod}
          onClose={() => {
            setShowMessenger(false);
            setSelectedMethod(null);
          }}
          isOpen={showMessenger}
        />
      )}
    </>
  );
}
