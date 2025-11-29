const { Router } = require('express');
const { body } = require('express-validator');
const { validateVoucher, handleSensorUpdate, servoCallback } = require('../controllers/iot.controller');
const validateRequest = require('../middlewares/validateRequest');

const router = Router();

router.post(
  '/iot/validate',
  [body('code').isLength({ min: 6, max: 6 }), body('deviceId').optional().isString()],
  validateRequest,
  validateVoucher
);

router.post(
  '/iot/sensor-update',
  [
    body('deviceId').optional().isString(),
    body('slotNumber').isInt({ min: 1 }),
    body('sensorIndex').isInt({ min: 0 }),
    body('value').isIn(['occupied', 'available', 'reserved', 'empty'])
  ],
  validateRequest,
  handleSensorUpdate
);

router.post(
  '/iot/servo-callback',
  [body('deviceId').optional().isString(), body('servoState').isString()],
  validateRequest,
  servoCallback
);

module.exports = router;
