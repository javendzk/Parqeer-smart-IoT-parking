const axios = require('axios');
const { blynkConfig } = require('../config/blynk');
const { query } = require('../config/db');
const { logger } = require('../utils/logger');

const client = axios.create({ timeout: 5000 });

const logDeviceEvent = async (type, payload) => {
  try {
    await query('INSERT INTO device_logs (deviceId, type, payload) VALUES ($1, $2, $3)', ['blynk-cloud', type, JSON.stringify(payload)]);
  } catch (error) {
    logger.error('Failed to log device event', { error: error.message });
  }
};

const performRequest = async (pin, value, attempt = 1) => {
  const url = `${blynkConfig.baseUrl}/external/api/update?token=${blynkConfig.token}&${pin}=${encodeURIComponent(value)}`;
  try {
    await client.get(url);
  } catch (error) {
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      return performRequest(pin, value, attempt + 1);
    }
    await logDeviceEvent('blynk-error', { pin, value, message: error.message });
    throw error;
  }
};

const updateVirtualPin = async (pin, value) => {
  if (!blynkConfig.token || !blynkConfig.baseUrl) return;
  try {
    await performRequest(pin, value);
  } catch (error) {
    logger.error('Blynk update failed', { pin, value, error: error.message });
  }
};

const pushSlotCounts = async () => {
  const availableResult = await query("SELECT COUNT(*)::INT AS count FROM slots WHERE status = 'available'");
  const reservedResult = await query("SELECT COUNT(*)::INT AS count FROM slots WHERE status = 'reserved'");
  const occupiedResult = await query("SELECT COUNT(*)::INT AS count FROM slots WHERE status = 'occupied'");
  const summary = JSON.stringify({
    available: availableResult.rows[0]?.count || 0,
    reserved: reservedResult.rows[0]?.count || 0,
    occupied: occupiedResult.rows[0]?.count || 0
  });
  await updateVirtualPin('V0', availableResult.rows[0]?.count || 0);
  await updateVirtualPin('V1', summary);
};

const sendServoCommand = async (slotNumber, command) => {
  await updateVirtualPin('V2', `${command}:${slotNumber}`);
};

const updateSensorPin = async (sensorIndex, value) => {
  const pinNumber = 3 + sensorIndex;
  await updateVirtualPin(`V${pinNumber}`, value);
};

const pushLastVoucher = async (code) => {
  await updateVirtualPin('V7', code);
};

module.exports = { updateVirtualPin, pushSlotCounts, sendServoCommand, updateSensorPin, pushLastVoucher };
