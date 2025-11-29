const { logger } = require('../utils/logger');

const errorMiddleware = [
  (err, req, res, next) => {
    const status = err.status || 500;
    logger.error('Request failed', {
      method: req.method,
      path: req.originalUrl,
      status,
      message: err.message,
      body: req.body,
      query: req.query,
      stack: err.stack
    });
    res.status(status).json({ message: err.message || 'Internal server error' });
  }
];

module.exports = errorMiddleware;
