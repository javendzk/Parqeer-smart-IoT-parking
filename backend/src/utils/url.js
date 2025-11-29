const crypto = require('crypto');

const sanitizeBaseUrl = (value) => {
  if (!value) return 'http://localhost:5173';
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const getAppBaseUrl = () => sanitizeBaseUrl(process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || 'http://localhost:5173');

const buildPaymentUrl = (paymentToken) => `${getAppBaseUrl()}/payment/${paymentToken}`;

const createPaymentToken = () => crypto.randomBytes(6).toString('base64url');

module.exports = { getAppBaseUrl, buildPaymentUrl, createPaymentToken };
