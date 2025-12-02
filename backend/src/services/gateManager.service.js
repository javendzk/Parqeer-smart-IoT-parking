const {
  getActiveGateSession,
  completeGateSession,
  setGateSessionBuzzerState
} = require('./gateSession.service');
const { sendGateCommand, sendBuzzerCommand } = require('./mqttBridge.service');
const { logger } = require('../utils/logger');

const processGateSensorEvent = async (slotNumber, status, app) => {
  const session = await getActiveGateSession();
  if (!session) {
    return;
  }

  if (slotNumber === session.slotNumber) {
    if (status === 'occupied') {
      await completeGateSession(session.id);
      await sendGateCommand(session.slotNumber, 'close');
      if (session.buzzerActive) {
        await setGateSessionBuzzerState(session.id, false);
        await sendBuzzerCommand('off', { expectedSlot: session.slotNumber });
      }
      const io = app.get('io');
      if (io) {
        io.emit('gateReady', { slotNumber: session.slotNumber });
      }
      logger.info('Gate session completed', { slotNumber });
    }
    return;
  }

  if (status === 'occupied') {
    if (!session.buzzerActive) {
      await setGateSessionBuzzerState(session.id, true);
      await sendBuzzerCommand('on', { expectedSlot: session.slotNumber, actualSlot: slotNumber });
      logger.warn('Vehicle parked in wrong slot', { expectedSlot: session.slotNumber, actualSlot: slotNumber });
    }
    return;
  }

  if (session.buzzerActive) {
    await setGateSessionBuzzerState(session.id, false);
    await sendBuzzerCommand('off', { expectedSlot: session.slotNumber });
    logger.info('Wrong slot cleared, buzzer silenced');
  }
};

module.exports = { processGateSensorEvent };
