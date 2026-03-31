/**
 * Quick communication utilities for drivers
 * Uses phone numbers already stored in driver profiles
 */

/**
 * Open WhatsApp Web with pre-filled message
 * @param {Object} driver - Driver object with phone number
 * @param {string} message - Message to send
 * @returns {void}
 */
export const openWhatsAppDirect = (driver, message = '') => {
  if (!driver?.phone) {
    console.warn('Driver has no phone number');
    return false;
  }

  const phoneNumber = driver.phone.replace(/\D/g, '');
  const encodedMessage = encodeURIComponent(message);
  const url = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;

  window.open(url, '_blank');
  return true;
};

/**
 * Open Telegram with driver handle
 * @param {Object} driver - Driver object with telegramHandle
 * @param {string} message - Message to send
 * @returns {void}
 */
export const openTelegramDirect = (driver, message = '') => {
  if (!driver?.telegramHandle) {
    console.warn('Driver has no Telegram handle');
    return false;
  }

  // Telegram Web only allows opening chats, not sending messages directly
  const handle = driver.telegramHandle.replace('@', '');
  const url = `https://t.me/${handle}`;

  window.open(url, '_blank');
  return true;
};

/**
 * Generate SMS link for direct send
 * @param {Object} driver - Driver object
 * @param {string} message - Message to send
 * @returns {string} SMS URI scheme link
 */
export const getSMSLink = (driver, message = '') => {
  if (!driver?.phone) return null;

  const phoneNumber = driver.phone.replace(/\D/g, '');
  const encodedMessage = encodeURIComponent(message);
  
  return `sms:${phoneNumber}?body=${encodedMessage}`;
};

/**
 * Get communication methods available for a driver
 * Auto-uses phone if WhatsApp number not explicitly set
 * @param {Object} driver - Driver object
 * @returns {Array} Available communication methods
 */
export const getAvailableMethods = (driver) => {
  const methods = [];

  // WhatsApp: use whatsappNumber if set, otherwise fallback to phone
  if (driver?.whatsappNumber || driver?.phone) {
    methods.push({
      key: 'whatsapp',
      label: 'WhatsApp',
      icon: 'mdi:whatsapp',
      value: driver.whatsappNumber || driver.phone,
      isDefault: !driver.whatsappNumber,
      description: driver.whatsappNumber ? 'Custom WhatsApp' : 'Phone-based WhatsApp'
    });
  }

  if (driver?.telegramHandle) {
    methods.push({
      key: 'telegram',
      label: 'Telegram',
      icon: 'mdi:telegram',
      value: driver.telegramHandle,
      description: 'Telegram @username'
    });
  }

  if (driver?.viberNumber) {
    methods.push({
      key: 'viber',
      label: 'Viber',
      icon: 'mdi:viber',
      value: driver.viberNumber,
      description: 'Viber number'
    });
  }

  if (driver?.signalNumber) {
    methods.push({
      key: 'signal',
      label: 'Signal',
      icon: 'mdi:shield',
      value: driver.signalNumber,
      description: 'Signal number'
    });
  }

  if (driver?.phone) {
    methods.push({
      key: 'sms',
      label: 'SMS',
      icon: 'mdi:message-text',
      value: driver.phone,
      description: 'Standard SMS'
    });
  }

  return methods;
};

/**
 * Format phone number for international use
 * @param {string} phone - Phone number
 * @param {string} countryCode - Default country code (e.g., '1' for USA)
 * @returns {string} Formatted phone number
 */
export const formatPhoneNumber = (phone, countryCode = '1') => {
  if (!phone) return '';

  const cleaned = phone.replace(/\D/g, '');
  
  // If it doesn't start with country code, add it
  if (!cleaned.startsWith(countryCode)) {
    return `${countryCode}${cleaned}`;
  }

  return cleaned;
};

/**
 * Send message via extension server
 * @param {Object} payload - Message payload
 * @returns {Promise} API response
 */
export const sendMessageViaExtension = async (payload) => {
  const response = await fetch('/api/extensions/send-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return response.json();
};

/**
 * Log communication action for audit trail
 * @param {Object} params - Log parameters
 * @returns {void}
 */
export const logCommunicationAction = (params) => {
  const {
    method,
    driver,
    action,
    message,
    status = 'attempted',
    timestamp = new Date().toISOString()
  } = params;

  const logEntry = {
    timestamp,
    method,
    driverId: driver?.id,
    driverName: driver?.name,
    action,
    messageLength: message?.length || 0,
    status
  };

  console.log('[COMMUNICATION]', logEntry);

  // In the future: send to analytics/audit endpoint
  // await fetch('/api/audit/communication', { method: 'POST', body: JSON.stringify(logEntry) });
};
