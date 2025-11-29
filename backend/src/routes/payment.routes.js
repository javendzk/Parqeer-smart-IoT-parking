const { Router } = require('express');
const { param, body } = require('express-validator');
const { getTransaction, payTransaction, paymentCallback } = require('../controllers/payment.controller');
const validateRequest = require('../middlewares/validateRequest');

const router = Router();

router.get(
  '/payment/:transactionId',
  [param('transactionId').isInt({ min: 1 })],
  validateRequest,
  getTransaction
);

router.post(
  '/payment/:transactionId/pay',
  [param('transactionId').isInt({ min: 1 })],
  validateRequest,
  payTransaction
);

router.post(
  '/payment/callback',
  [body('transactionId').isInt({ min: 1 }), body('status').isString()],
  validateRequest,
  paymentCallback
);

module.exports = router;
