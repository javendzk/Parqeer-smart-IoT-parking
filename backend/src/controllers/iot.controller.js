const dotenv = require('dotenv');
const { query } = require('../config/db');
const { getVoucherByCode, markVoucherUsed } = require('../services/voucher.service');
const { pushSlotCounts, sendServoCommand, updateSensorPin } = require('../services/blynk.service');
const { logger } = require('../utils/logger');

dotenv.config();

const deviceToken = process.env.DEVICE_TOKEN;

const isAuthorized = (req) => {
  const token = req.headers['x-device-token'];
  return token && deviceToken && token === deviceToken;
};

const logDeviceEvent = async (deviceId, type, payload) => {
  try {
    await query('INSERT INTO device_logs (deviceId, type, payload) VALUES ($1, $2, $3)', [deviceId, type, JSON.stringify(payload)]);
  } catch (error) {
    logger.error('Failed to log device event', { error: error.message });
  }
};

const validateVoucher = async (req, res, next) => {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ message: 'Unauthorized device' });
    }
    const { code, deviceId } = req.body;
    const voucher = await getVoucherByCode(code);
    if (!voucher) {
      return res.status(404).json({ valid: false, message: 'Voucher not found' });
    }
    if (voucher.status !== 'unused') {
      return res.status(400).json({ valid: false, message: 'Voucher not usable' });
    }
    if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
      return res.status(400).json({ valid: false, message: 'Voucher expired' });
    }
    await markVoucherUsed(voucher.id);
    await query("UPDATE slots SET status = 'occupied', updatedAt = now() WHERE id = $1", [voucher.slotId]);
    await pushSlotCounts();
    await sendServoCommand(voucher.slotNumber, 'open');
    const io = req.app.get('io');
    if (io) {
      io.emit('servoOpen', { slotNumber: voucher.slotNumber });
      io.emit('slotUpdate', { slotNumber: voucher.slotNumber, status: 'occupied' });
    }
    await logDeviceEvent(deviceId || 'esp32', 'voucher-validated', { code, slotNumber: voucher.slotNumber });
    res.json({ valid: true, slotNumber: voucher.slotNumber, action: 'open' });
  } catch (error) {
    next(error);
  }
};

const handleSensorUpdate = async (req, res, next) => {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ message: 'Unauthorized device' });
    }
    const { deviceId, slotNumber, sensorIndex, value } = req.body;
    const slotResult = await query('SELECT id, slotnumber AS "slotNumber", status FROM slots WHERE slotnumber = $1', [slotNumber]);
    const slot = slotResult.rows[0];
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }
    const nextStatus = value === 'occupied' ? 'occupied' : 'available';
    if (slot.status !== nextStatus) {
      await query('UPDATE slots SET status = $1, updatedAt = now() WHERE id = $2', [nextStatus, slot.id]);
    }
    await logDeviceEvent(deviceId || 'esp32', 'sensor-update', { slotNumber, sensorIndex, value });
    const normalizedIndex = typeof sensorIndex === 'number' ? sensorIndex : 0;
    await updateSensorPin(normalizedIndex, value);
    await pushSlotCounts();
    const io = req.app.get('io');
    if (io) {
      io.emit('slotUpdate', { slotNumber, status: nextStatus });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

const servoCallback = async (req, res, next) => {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ message: 'Unauthorized device' });
    }
    const { deviceId, servoState } = req.body;
    await logDeviceEvent(deviceId || 'esp32', 'servo-callback', { servoState });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

module.exports = { validateVoucher, handleSensorUpdate, servoCallback };
