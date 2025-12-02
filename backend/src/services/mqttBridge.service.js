const { publish, subscribe } = require('../config/mqtt');
const { query } = require('../config/db');
const { getVoucherByCode, markVoucherUsed } = require('./voucher.service');
const { processGateSensorEvent } = require('./gateManager.service');
const { getActiveGateSession, createGateSession } = require('./gateSession.service');
const { logger } = require('../utils/logger');

const logDeviceEvent = async (deviceId, type, payload) => {
  try {
    await query('INSERT INTO device_logs (deviceId, type, payload) VALUES ($1, $2, $3)', [deviceId, type, JSON.stringify(payload)]);
  } catch (error) {
    logger.error('Failed to log device event', { error: error.message });
  }
};

const publishSystemNotify = (payload) => publish('parking/system/notify', payload);
const publishVoucherResponse = (payload) => publish('parking/voucher/validateResponse', payload);
const sendIndicatorCommand = (state, meta = {}) => publish('parking/indicator/wrong-slot', { state, ...meta });

const sendGateCommand = (slotNumber, command) => {
  const topic = command === 'open' ? 'parking/gate/open' : 'parking/gate/close';
  return publish(topic, { slotNumber, command });
};

const pushSlotCounts = async () => {
  const availableResult = await query("SELECT COUNT(*)::INT AS count FROM slots WHERE status = 'available'");
  const reservedResult = await query("SELECT COUNT(*)::INT AS count FROM slots WHERE status = 'reserved'");
  const occupiedResult = await query("SELECT COUNT(*)::INT AS count FROM slots WHERE status = 'occupied'");
  const summary = {
    type: 'slot-summary',
    available: availableResult.rows[0]?.count || 0,
    reserved: reservedResult.rows[0]?.count || 0,
    occupied: occupiedResult.rows[0]?.count || 0
  };
  await publishSystemNotify(summary);
};

const announceVoucher = async (code, slotNumber) => {
  await publishSystemNotify({ type: 'voucher-created', code, slotNumber });
};

const announceSensorStatus = async (slotNumber, status) => {
  await publishSystemNotify({ type: 'sensor-update', slotNumber, status });
};

const handleVoucherCheck = async (payload, app) => {
  const { code, deviceId } = payload || {};
  if (!code) return;
  const activeSession = await getActiveGateSession();
  if (activeSession) {
    await publishVoucherResponse({ code, valid: false, message: 'Gate is currently in use' });
    return;
  }

  const voucher = await getVoucherByCode(code);
  if (!voucher) {
    await publishVoucherResponse({ code, valid: false, message: 'Voucher not found' });
    return;
  }
  if (voucher.status !== 'unused') {
    await publishVoucherResponse({ code, valid: false, message: 'Voucher not usable' });
    return;
  }
  if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
    await publishVoucherResponse({ code, valid: false, message: 'Voucher expired' });
    return;
  }
  const transactionResult = await query('SELECT status FROM transactions WHERE voucherId = $1', [voucher.id]);
  const transaction = transactionResult.rows[0];
  if (!transaction || transaction.status !== 'paid') {
    await publishVoucherResponse({ code, valid: false, message: 'Voucher not paid' });
    return;
  }
  await markVoucherUsed(voucher.id);
  await createGateSession({ voucherId: voucher.id, slotId: voucher.slotId, slotNumber: voucher.slotNumber });
  await sendGateCommand(voucher.slotNumber, 'open');
  await publishVoucherResponse({ code, valid: true, slotNumber: voucher.slotNumber, action: 'open' });
  await logDeviceEvent(deviceId || 'esp32', 'voucher-validated-mqtt', { code, slotNumber: voucher.slotNumber });
};

const handleSlotStatus = async (topic, payload, app) => {
  const [, , slotNumberPart] = topic.split('/');
  const slotNumber = Number(slotNumberPart);
  if (!slotNumber) return;
  const statusValue = payload?.status ?? payload?.value;
  const nextStatus = statusValue === 'occupied' || statusValue === 1 ? 'occupied' : statusValue === 'reserved' ? 'reserved' : 'available';
  const slotResult = await query('SELECT * FROM slots WHERE slotNumber = $1', [slotNumber]);
  const slot = slotResult.rows[0];
  if (!slot) return;
  if (slot.status !== nextStatus) {
    await query('UPDATE slots SET status = $1, updatedAt = now() WHERE id = $2', [nextStatus, slot.id]);
    await pushSlotCounts();
  }
  await announceSensorStatus(slotNumber, nextStatus);
  await processGateSensorEvent(slotNumber, nextStatus, app);
  const io = app.get('io');
  if (io) {
    io.emit('slotUpdate', { slotNumber, status: nextStatus });
  }
  await logDeviceEvent(payload?.deviceId || 'esp32', 'sensor-update-mqtt', { slotNumber, status: nextStatus });
};

const handleGateState = async (payload) => {
  await publishSystemNotify({ type: 'gate-state', ...payload });
  await logDeviceEvent(payload?.deviceId || 'esp32', 'gate-state', payload);
};

const initMqttBridge = (app) => {
  subscribe('parking/voucher/check', (payload) => {
    handleVoucherCheck(payload, app).catch((error) => logger.error('Voucher check MQTT failed', { error: error.message }));
  });

  subscribe('parking/slot/+/status', (payload, topic) => {
    handleSlotStatus(topic, payload, app).catch((error) => logger.error('Slot status MQTT failed', { error: error.message }));
  });

  subscribe('parking/gate/state', (payload) => {
    handleGateState(payload).catch((error) => logger.error('Gate state MQTT failed', { error: error.message }));
  });
};

module.exports = {
  pushSlotCounts,
  announceVoucher,
  sendGateCommand,
  sendIndicatorCommand,
  announceSensorStatus,
  publishVoucherResponse,
  publishSystemNotify,
  initMqttBridge
};
