const { Router } = require('express');
const { body, param } = require('express-validator');
const { getSlots, createBooking, getVoucher } = require('../controllers/booking.controller');
const validateRequest = require('../middlewares/validateRequest');

const router = Router();

router.get('/slots', getSlots);
router.post(
  '/book',
  [body('slotNumber').optional().isInt({ min: 1 })],
  validateRequest,
  createBooking
);
router.get(
  '/voucher/:code',
  [param('code').isLength({ min: 6, max: 6 })],
  validateRequest,
  getVoucher
);

module.exports = router;
