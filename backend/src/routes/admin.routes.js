const { Router } = require('express');
const { body } = require('express-validator');
const { getOverview, resetSlot, login, triggerServo } = require('../controllers/admin.controller');
const validateRequest = require('../middlewares/validateRequest');
const authMiddleware = require('../middlewares/auth.middleware');

const router = Router();

router.post(
  '/admin/login',
  [body('username').isString(), body('password').isString()],
  validateRequest,
  login
);

router.get('/admin/overview', authMiddleware, getOverview);

router.post(
  '/admin/reset-slot',
  authMiddleware,
  [body('slotNumber').isInt({ min: 1 })],
  validateRequest,
  resetSlot
);

router.post(
  '/admin/servo-command',
  authMiddleware,
  [body('slotNumber').isInt({ min: 1 }), body('command').isIn(['open', 'close'])],
  validateRequest,
  triggerServo
);

module.exports = router;
