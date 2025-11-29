const { logger } = require('../utils/logger');

const errorMiddleware = [
  (err, req, res, next) => {
    logger.error('Request failed', { path: req.path, message: err.message });
    const status = err.status || 500;
    res.status(status).json({ message: err.message || 'Internal server error' });
  }
];

module.exports = errorMiddleware;
