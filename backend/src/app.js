const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bookingRoutes = require('./routes/booking.routes');
const paymentRoutes = require('./routes/payment.routes');
const iotRoutes = require('./routes/iot.routes');
const adminRoutes = require('./routes/admin.routes');
const errorMiddleware = require('./middlewares/error.middleware');

dotenv.config();

const app = express();

app.use(cors());
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
