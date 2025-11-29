const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bookingRoutes = require('./routes/booking.routes');
const paymentRoutes = require('./routes/payment.routes');
const iotRoutes = require('./routes/iot.routes');
const adminRoutes = require('./routes/admin.routes');
const errorMiddleware = require('./middlewares/error.middleware');
const { logger } = require('./utils/logger');

dotenv.config();

const app = express();

const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-token', 'Accept', 'X-Requested-With'],
  exposedHeaders: ['Content-Length']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  const requestedHeaders = req.header('Access-Control-Request-Headers');
  res.header('Access-Control-Allow-Headers', requestedHeaders || 'Content-Type,Authorization,x-device-token,Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('HTTP access', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start
    });
  });
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1', bookingRoutes);
app.use('/api/v1', paymentRoutes);
app.use('/api/v1', iotRoutes);
app.use('/api/v1', adminRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use(errorMiddleware);

module.exports = app;
