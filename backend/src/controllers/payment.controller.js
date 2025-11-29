const { query } = require('../config/db');
const { getTransactionById, markTransactionPaid, updateTransactionStatus } = require('../services/paymentMock.service');
const { pushSlotCounts, announceVoucher } = require('../services/mqttBridge.service');

const getTransaction = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const transaction = await getTransactionById(transactionId);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    res.json({ transaction });
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
    await markTransactionPaid(transactionId);
    await query("UPDATE slots SET status = 'reserved', updatedAt = now() WHERE id = $1", [transaction.voucherSlotId]);
    await pushSlotCounts();
    await announceVoucher(transaction.voucherCode, transaction.slotNumber);
    const io = req.app.get('io');
    if (io) {
      io.emit('paymentSuccess', { transactionId: Number(transactionId), voucherCode: transaction.voucherCode });
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

module.exports = { getTransaction, payTransaction, paymentCallback };
