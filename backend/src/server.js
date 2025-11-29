const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const app = require('./app');
const { logger } = require('./utils/logger');
const { initMqttBridge } = require('./services/mqttBridge.service');

dotenv.config();

const port = process.env.PORT || 4000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  path: process.env.SOCKET_IO_PATH || '/socket.io'
});

app.set('io', io);
initMqttBridge(app);

io.on('connection', (socket) => {
  logger.info('Socket connected', { id: socket.id });
  socket.on('disconnect', () => {
    logger.info('Socket disconnected', { id: socket.id });
  });
});

server.listen(port, () => {
  logger.info('Server listening', { port });
});
