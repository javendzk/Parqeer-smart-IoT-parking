const dotenv = require('dotenv');
const { query } = require('../config/db');
const { getVoucherByCode, markVoucherUsed } = require('../services/voucher.service');
const { getActiveGateSession, createGateSession } = require('../services/gateSession.service');
const { processGateSensorEvent } = require('../services/gateManager.service');
const {
  pushSlotCounts,
  sendGateCommand,
  announceSensorStatus,
  publishVoucherResponse
} = require('../services/mqttBridge.service');
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
    const activeSession = await getActiveGateSession();
    if (activeSession) {
      return res.status(409).json({ valid: false, message: 'Gate is currently in use' });
    }

    const voucher = await getVoucherByCode(code);
    if (!voucher) {
      await publishVoucherResponse({ code, valid: false, message: 'Voucher not found' });
      return res.status(404).json({ valid: false, message: 'Voucher not found' });
    }
    if (voucher.status !== 'unused') {
      await publishVoucherResponse({ code, valid: false, message: 'Voucher not usable' });
      return res.status(400).json({ valid: false, message: 'Voucher not usable' });
    }
    if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
      await publishVoucherResponse({ code, valid: false, message: 'Voucher expired' });
      return res.status(400).json({ valid: false, message: 'Voucher expired' });
    }
    const transactionResult = await query('SELECT status FROM transactions WHERE voucherId = $1', [voucher.id]);
    const transaction = transactionResult.rows[0];
    if (!transaction || transaction.status !== 'paid') {
      await publishVoucherResponse({ code, valid: false, message: 'Voucher not paid' });
      return res.status(400).json({ valid: false, message: 'Voucher not paid' });
    }
    await markVoucherUsed(voucher.id);
    await createGateSession({ voucherId: voucher.id, slotId: voucher.slotId, slotNumber: voucher.slotNumber });
    await sendGateCommand(voucher.slotNumber, 'open');
    await publishVoucherResponse({ code, valid: true, slotNumber: voucher.slotNumber, action: 'open' });
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
    const nextStatus = value === 'occupied' ? 'occupied' : value === 'reserved' ? 'reserved' : 'available';
    if (slot.status !== nextStatus) {
      await query('UPDATE slots SET status = $1, updatedAt = now() WHERE id = $2', [nextStatus, slot.id]);
    }
    await logDeviceEvent(deviceId || 'esp32', 'sensor-update', { slotNumber, sensorIndex, value });
    await announceSensorStatus(slotNumber, nextStatus);
    await pushSlotCounts();
    await processGateSensorEvent(slotNumber, nextStatus, req.app);
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
