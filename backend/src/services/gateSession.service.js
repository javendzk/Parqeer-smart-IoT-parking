const { query } = require('../config/db');

const getActiveGateSession = async () => {
  const result = await query(
    `SELECT gs.*, v.code AS "voucherCode"
     FROM gate_sessions gs
     LEFT JOIN vouchers v ON v.id = gs.voucherId
     WHERE gs.status = 'entering'
     ORDER BY gs.createdAt ASC
     LIMIT 1`
  );
  return result.rows[0];
};

const createGateSession = async ({ voucherId, slotId, slotNumber }) => {
  const result = await query(
    `INSERT INTO gate_sessions (voucherId, slotId, slotNumber)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [voucherId, slotId, slotNumber]
  );
  return result.rows[0];
};

const completeGateSession = async (sessionId) => {
  const result = await query(
    `UPDATE gate_sessions
     SET status = 'parked', updatedAt = now(), completedAt = now(), buzzerActive = FALSE
     WHERE id = $1
     RETURNING *`,
    [sessionId]
  );
  return result.rows[0];
};

const cancelActiveGateSessions = async () => {
  await query(
    `UPDATE gate_sessions
     SET status = 'aborted', updatedAt = now(), completedAt = now(), buzzerActive = FALSE
     WHERE status = 'entering'`
  );
};

const setGateSessionBuzzerState = async (sessionId, state) => {
  const result = await query(
    `UPDATE gate_sessions
     SET buzzerActive = $2, updatedAt = now()
     WHERE id = $1
     RETURNING *`,
    [sessionId, state]
  );
  return result.rows[0];
};

module.exports = {
  getActiveGateSession,
  createGateSession,
  completeGateSession,
  cancelActiveGateSessions,
  setGateSessionBuzzerState
};
