const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { pushSlotCounts, sendServoCommand } = require('../services/blynk.service');

dotenv.config();

const getOverview = async (req, res, next) => {
  try {
    const slotTotals = await query(
      "SELECT status, COUNT(*)::INT AS count FROM slots GROUP BY status"
    );
    const totals = slotTotals.rows.reduce(
      (acc, row) => ({ ...acc, [row.status]: row.count }),
      { available: 0, reserved: 0, occupied: 0 }
    );
    const lastTransactions = await query(
      'SELECT t.id, t.status, v.code AS "voucherCode", s.slotnumber AS "slotNumber", t.updatedAt FROM transactions t JOIN vouchers v ON t.voucherId = v.id JOIN slots s ON v.slotId = s.id ORDER BY t.updatedAt DESC LIMIT 5'
    );
    const lastDeviceLogs = await query(
      'SELECT id, deviceId, type, payload, createdAt FROM device_logs ORDER BY createdAt DESC LIMIT 5'
    );
    res.json({ totals, lastTransactions: lastTransactions.rows, lastDeviceLogs: lastDeviceLogs.rows });
  } catch (error) {
    next(error);
  }
};

const resetSlot = async (req, res, next) => {
  try {
    const { slotNumber } = req.body;
    const slotResult = await query('SELECT id FROM slots WHERE slotnumber = $1', [slotNumber]);
    if (slotResult.rowCount === 0) {
      return res.status(404).json({ message: 'Slot not found' });
    }
    await query("UPDATE slots SET status = 'available', updatedAt = now() WHERE slotnumber = $1", [slotNumber]);
    await query("UPDATE vouchers SET status = 'expired' WHERE slotId = $1 AND status = 'unused'", [slotResult.rows[0].id]);
    await pushSlotCounts();
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

const triggerServo = async (req, res, next) => {
  try {
    const { slotNumber, command } = req.body;
    await sendServoCommand(slotNumber, command);
    const io = req.app.get('io');
    if (io) {
      io.emit('servoCommand', { slotNumber, command });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    if (username !== adminUser || password !== adminPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '12h' });
    res.json({ token });
  } catch (error) {
    next(error);
  }
};

module.exports = { getOverview, resetSlot, login, triggerServo };
