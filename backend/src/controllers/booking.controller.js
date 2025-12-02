const dotenv = require('dotenv');
const { query } = require('../config/db');
const { createVoucherForSlot, getVoucherByCode, setVoucherStatus } = require('../services/voucher.service');
const { pushSlotCounts, announceVoucher } = require('../services/mqttBridge.service');
const { logger } = require('../utils/logger');
const { buildPaymentUrl, createPaymentToken } = require('../utils/url');

dotenv.config();

const ttlMinutes = parseInt(process.env.VOUCHER_TTL_MINUTES || '5', 10);

const getSlots = async (req, res, next) => {
  try {
    const result = await query('SELECT id, slotnumber AS "slotNumber", status FROM slots ORDER BY slotnumber ASC');
    const availableResult = await query("SELECT COUNT(*)::INT AS count FROM slots WHERE status = 'available'");
    res.json({ slots: result.rows, availableCount: availableResult.rows[0]?.count || 0 });
  } catch (error) {
    next(error);
  }
};

const createBooking = async (req, res, next) => {
  try {
    const { slotNumber } = req.body;
    let slot;
    if (slotNumber) {
      const slotResult = await query('SELECT id, slotnumber AS "slotNumber", status FROM slots WHERE slotnumber = $1', [slotNumber]);
      slot = slotResult.rows[0];
      if (!slot || slot.status !== 'available') {
        return res.status(400).json({ message: 'Slot not available' });
      }
    } else {
      const slotResult = await query("SELECT id, slotnumber AS \"slotNumber\", status FROM slots WHERE status = 'available' ORDER BY slotnumber ASC LIMIT 1");
      slot = slotResult.rows[0];
      if (!slot) {
        return res.status(400).json({ message: 'No available slots' });
      }
    }

    await query("UPDATE slots SET status = 'reserved', updatedAt = now() WHERE id = $1", [slot.id]);
    const voucher = await createVoucherForSlot(slot.id, ttlMinutes);
    const paymentToken = createPaymentToken();
    const transaction = await query(
      "INSERT INTO transactions (voucherId, amount, status, paymentToken) VALUES ($1, $2, $3, $4) RETURNING *",
      [voucher.id, 0, 'pending', paymentToken]
    );

    await pushSlotCounts();
    await announceVoucher(voucher.code, slot.slotNumber);
    const io = req.app.get('io');
    if (io) {
      io.emit('slotUpdate', { slotNumber: slot.slotNumber, status: 'reserved' });
      io.emit('voucherCreated', { code: voucher.code, slotNumber: slot.slotNumber });
    }

    const transactionRow = transaction.rows[0];
    const paymentUrl = buildPaymentUrl(transactionRow.paymenttoken || paymentToken);

    const expiresAt = voucher.expiresAt || voucher.expiresat || null;

    res.status(201).json({
      voucherCode: voucher.code,
      transactionId: transactionRow.id,
      paymentToken: transactionRow.paymenttoken || paymentToken,
      expiresAt,
      paymentUrl
    });
  } catch (error) {
    if (slot?.id) {
      await query("UPDATE slots SET status = 'available', updatedAt = now() WHERE id = $1", [slot.id]);
    }
    logger.error('Booking failed', { error: error.message });
    next(error);
  }
};

const getVoucher = async (req, res, next) => {
  try {
    const { code } = req.params;
    const voucher = await getVoucherByCode(code);
    if (!voucher) {
      return res.status(404).json({ message: 'Voucher not found' });
    }
    if (voucher.status === 'unused' && voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
      await setVoucherStatus(voucher.id, 'expired');
      voucher.status = 'expired';
    }
    res.json({ voucher });
  } catch (error) {
    next(error);
  }
};

module.exports = { getSlots, createBooking, getVoucher };
