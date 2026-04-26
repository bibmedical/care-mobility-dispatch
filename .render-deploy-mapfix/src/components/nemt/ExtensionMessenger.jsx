'use client';

import React, { useState } from 'react';
import { Button, Modal, Form, Spinner, Alert } from 'react-bootstrap';
import IconifyIcon from '@/components/wrappers/IconifyIcon';

export default function ExtensionMessenger({ driver, onClose, initialMethod = null, isOpen = true }) {
  const [selectedMethod, setSelectedMethod] = useState(initialMethod);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const METHODS = [
    { key: 'whatsapp', label: 'WhatsApp', icon: 'mdi:whatsapp', color: '#25D366', value: driver?.whatsappNumber || driver?.phone },
    { key: 'telegram', label: 'Telegram', icon: 'mdi:telegram', color: '#0088cc', value: driver?.telegramHandle },
    { key: 'viber', label: 'Viber', icon: 'mdi:viber', color: '#7B519C', value: driver?.viberNumber },
    { key: 'signal', label: 'Signal', icon: 'mdi:shield', color: '#3A96D6', value: driver?.signalNumber },
    { key: 'sms', label: 'SMS', icon: 'mdi:message-text', color: '#009FDF', value: driver?.phone }
  ].filter(m => m.value);

  const handleSendMessage = async () => {
    if (!selectedMethod || !message.trim()) {
      setResult({ error: 'Please select a method and enter a message' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        method: selectedMethod,
        message: message.trim(),
        driverId: driver.id,
        driverName: driver.name,
        phoneNumber: driver.phone,
        telegramHandle: driver.telegramHandle,
        viberNumber: driver.viberNumber,
        signalNumber: driver.signalNumber
      };

      const response = await fetch('/api/extensions/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      
      if (data.success) {
        setResult({ success: `Message sent via ${selectedMethod}!`, demo: data.demo });
        setMessage('');
        setSelectedMethod(null);
        setTimeout(() => setResult(null), 3000);
      } else {
        setResult({ error: data.error || 'Failed to send message' });
      }
    } catch (error) {
      setResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal show={isOpen} onHide={onClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>Send Message to {driver?.name}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {result?.error && <Alert variant="danger">{result.error}</Alert>}
        {result?.success && <Alert variant="success">{result.success} {result.demo && '(Demo Mode)'}</Alert>}

        <div className="mb-3">
          <Form.Label className="fw-semibold mb-2">Select Communication Channel:</Form.Label>
          <div className="d-flex flex-wrap gap-2">
            {METHODS.map(method => (
              <Button
                key={method.key}
                variant={selectedMethod === method.key ? 'primary' : 'outline-secondary'}
                size="sm"
                onClick={() => setSelectedMethod(method.key)}
                className="d-flex align-items-center gap-2"
              >
                <IconifyIcon icon={method.icon} />
                {method.label}
              </Button>
            ))}
          </div>
        </div>

        {selectedMethod && (
          <div className="mb-3">
            <Form.Group>
              <Form.Label className="fw-semibold">Message:</Form.Label>
              <Form.Control
                as="textarea"
                rows={4}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Enter your message..."
                maxLength={500}
              />
              <small className="text-secondary">{message.length}/500 characters</small>
            </Form.Group>
          </div>
        )}

        <div className="p-3 bg-light rounded">
          <small className="text-secondary">
            <strong>Method Details:</strong>
            {selectedMethod === 'whatsapp' && ' • Uses Twilio WhatsApp API'}
            {selectedMethod === 'telegram' && ' • Requires Telegram Bot integration'}
            {selectedMethod === 'viber' && ' • Uses Viber Bot API'}
            {selectedMethod === 'signal' && ' • Requires Signal server integration'}
            {selectedMethod === 'sms' && ' • Uses Twilio SMS API'}
          </small>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Close
        </Button>
        <Button
          variant="primary"
          onClick={handleSendMessage}
          disabled={!selectedMethod || !message.trim() || loading}
        >
          {loading && <Spinner size="sm" className="me-2" />}
          Send Message
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
