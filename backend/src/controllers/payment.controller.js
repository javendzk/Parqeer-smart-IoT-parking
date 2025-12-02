const { query } = require('../config/db');
const { getTransactionById, getTransactionByToken, markTransactionPaid, updateTransactionStatus } = require('../services/paymentMock.service');
const { pushSlotCounts, announceVoucher } = require('../services/mqttBridge.service');
const { buildPaymentUrl } = require('../utils/url');

const getTransaction = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const transaction = await getTransactionById(transactionId);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    res.json({ transaction: { ...transaction, paymentUrl: buildPaymentUrl(transaction.paymenttoken), paymentToken: transaction.paymenttoken } });
  } catch (error) {
    next(error);
  }
};

const getTransactionByPaymentToken = async (req, res, next) => {
  try {
    const { paymentToken } = req.params;
    const transaction = await getTransactionByToken(paymentToken);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    res.json({ transaction: { ...transaction, paymentUrl: buildPaymentUrl(transaction.paymenttoken), paymentToken: transaction.paymenttoken } });
  } catch (error) {
    next(error);
  }
};

const payTransaction = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const transaction = await getTransactionById(transactionId);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    if (transaction.status !== 'pending') {
      return res.status(400).json({ message: 'Transaction already processed' });
    }
    if (transaction.voucherStatus === 'expired' || (transaction.expiresAt && new Date(transaction.expiresAt) < new Date())) {
      await query("UPDATE transactions SET status = 'expired', updatedAt = now() WHERE id = $1", [transaction.id]);
      await query("UPDATE vouchers SET status = 'expired', updatedAt = now() WHERE id = $1", [transaction.voucherid || transaction.voucherId]);
      await query("UPDATE slots SET status = 'available', updatedAt = now() WHERE id = $1", [transaction.voucherSlotId]);
      return res.status(400).json({ message: 'Reservation expired' });
    }
    await markTransactionPaid(transactionId);
    await query("UPDATE slots SET status = 'reserved', updatedAt = now() WHERE id = $1", [transaction.voucherSlotId]);
    await pushSlotCounts();
    await announceVoucher(transaction.voucherCode, transaction.slotNumber);
    const io = req.app.get('io');
    if (io) {
      io.emit('paymentSuccess', { transactionId:      Number(transactionId), voucherCode: transaction.voucherCode });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

const paymentCallback = async (req, res, next) => {
  try {
    const { transactionId, status } = req.body;
    if (!transactionId || !status) {
      return res.status(400).json({ message: 'Invalid payload' });
    }
    const transaction = await updateTransactionStatus(transactionId, status);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

module.exports = { getTransaction, getTransactionByPaymentToken, payTransaction, paymentCallback };
