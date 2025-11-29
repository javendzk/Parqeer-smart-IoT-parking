const { query } = require('../config/db');

const getTransactionById = async (transactionId) => {
  const result = await query(
    'SELECT t.*, v.code AS "voucherCode", v.slotId AS "voucherSlotId", s.slotnumber AS "slotNumber" FROM transactions t JOIN vouchers v ON t.voucherId = v.id JOIN slots s ON v.slotId = s.id WHERE t.id = $1',
    [transactionId]
  );
  return result.rows[0];
};

const markTransactionPaid = async (transactionId) => {
  const result = await query(
    "UPDATE transactions SET status = 'paid', updatedAt = now() WHERE id = $1 RETURNING *",
    [transactionId]
  );
  return result.rows[0];
};

const updateTransactionStatus = async (transactionId, status) => {
  const result = await query(
    'UPDATE transactions SET status = $1, updatedAt = now() WHERE id = $2 RETURNING *',
    [status, transactionId]
  );
  return result.rows[0];
};

module.exports = { getTransactionById, markTransactionPaid, updateTransactionStatus };
