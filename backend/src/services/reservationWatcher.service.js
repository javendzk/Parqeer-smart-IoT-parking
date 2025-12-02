const dotenv = require('dotenv');
const { query } = require('../config/db');
const { pushSlotCounts } = require('./mqttBridge.service');
const { logger } = require('../utils/logger');

dotenv.config();

const sweepIntervalMs = parseInt(process.env.RESERVATION_SWEEP_INTERVAL_MS || '30000', 10);

const releaseExpiredReservations = async (app) => {
  const expired = await query(
    `SELECT v.id AS "voucherId", v.slotId, s.slotnumber AS "slotNumber", t.id AS "transactionId"
     FROM vouchers v
     JOIN slots s ON s.id = v.slotId
     LEFT JOIN transactions t ON t.voucherId = v.id
     WHERE v.status = 'unused'
       AND (t.status IS NULL OR t.status = 'pending')
       AND v.expiresAt IS NOT NULL
       AND v.expiresAt < now()`
  );

  if (!expired.rowCount) {
    return;
  }

  const slotIds = [];
  const voucherIds = [];
  const transactionIds = [];

  expired.rows.forEach((row) => {
    slotIds.push(row.slotId);
    voucherIds.push(row.voucherId);
    if (row.transactionId) {
      transactionIds.push(row.transactionId);
    }
  });

  if (voucherIds.length) {
    await query(
      `UPDATE vouchers SET status = 'expired', updatedAt = now()
       WHERE id = ANY($1::int[])`,
      [voucherIds]
    );
  }

  if (slotIds.length) {
    await query(
      `UPDATE slots SET status = 'available', updatedAt = now()
       WHERE id = ANY($1::int[])`,
      [slotIds]
    );
  }

  if (transactionIds.length) {
    await query(
      `UPDATE transactions SET status = 'expired', updatedAt = now()
       WHERE id = ANY($1::int[])`,
      [transactionIds]
    );
  }

  await pushSlotCounts();
  const io = app.get('io');
  if (io) {
    expired.rows.forEach((row) => {
      io.emit('slotUpdate', { slotNumber: row.slotNumber, status: 'available' });
      io.emit('reservationExpired', { voucherId: row.voucherId, slotNumber: row.slotNumber });
    });
  }

  logger.info('Released expired reservations', { count: expired.rowCount });
};

const startReservationWatcher = (app) => {
  releaseExpiredReservations(app).catch((error) => logger.error('Initial reservation sweep failed', { error: error.message }));
  setInterval(() => {
    releaseExpiredReservations(app).catch((error) => logger.error('Reservation sweep failed', { error: error.message }));
  }, sweepIntervalMs);
};

module.exports = { startReservationWatcher, releaseExpiredReservations };
