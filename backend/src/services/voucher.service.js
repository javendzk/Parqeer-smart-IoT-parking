const { query } = require('../config/db');
const { generateVoucher } = require('../utils/generateVoucher');

const normalizeVoucherRow = (row) => {
  if (!row) return row;
  return {
    ...row,
    slotId: row.slotId ?? row.slotid,
    slotNumber: row.slotNumber ?? row.slotnumber,
    slotStatus: row.slotStatus ?? row.slotstatus,
    expiresAt: row.expiresAt ?? row.expiresat,
    createdAt: row.createdAt ?? row.createdat,
    updatedAt: row.updatedAt ?? row.updatedat,
    usedAt: row.usedAt ?? row.usedat
  };
};

const createVoucherForSlot = async (slotId, ttlMinutes) => {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  for (let i = 0; i < 5; i += 1) {
    const code = generateVoucher();
    const existing = await query('SELECT id FROM vouchers WHERE code = $1', [code]);
    if (existing.rowCount === 0) {
      const insert = await query(
        'INSERT INTO vouchers (code, slotId, expiresAt) VALUES ($1, $2, $3) RETURNING *',
        [code, slotId, expiresAt]
      );
      return normalizeVoucherRow(insert.rows[0]);
    }
  }
  throw new Error('Unable to generate voucher code');
};

const getVoucherByCode = async (code) => {
  const result = await query(
    'SELECT v.*, v.slotId AS "slotId", s.slotnumber AS "slotNumber", s.status AS "slotStatus" FROM vouchers v JOIN slots s ON v.slotId = s.id WHERE v.code = $1',
    [code]
  );
  return normalizeVoucherRow(result.rows[0]);
};

const setVoucherStatus = async (voucherId, status) => {
  const result = await query(
    'UPDATE vouchers SET status = $1 WHERE id = $2 RETURNING *',
    [status, voucherId]
  );
  return normalizeVoucherRow(result.rows[0]);
};

const markVoucherUsed = async (voucherId) => {
  const result = await query(
    "UPDATE vouchers SET status = 'used', usedAt = now() WHERE id = $1 RETURNING *",
    [voucherId]
  );
  return normalizeVoucherRow(result.rows[0]);
};

module.exports = { createVoucherForSlot, getVoucherByCode, setVoucherStatus, markVoucherUsed };
