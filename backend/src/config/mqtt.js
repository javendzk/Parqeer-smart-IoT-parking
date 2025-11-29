const mqtt = require('mqtt');
const dotenv = require('dotenv');
const { logger } = require('../utils/logger');

dotenv.config();

const host = process.env.MQTT_HOST;
const port = process.env.MQTT_PORT || '8883';
const username = process.env.MQTT_USERNAME;
const password = process.env.MQTT_PASSWORD;

const url = host ? `mqtts://${host}:${port}` : undefined;

let client;

if (url) {
  client = mqtt.connect(url, {
    username,
    password,
    reconnectPeriod: 5000,
    rejectUnauthorized: false
  });

  client.on('connect', () => {
    logger.info('MQTT connected', { host, port });
  });

  client.on('error', (error) => {
    logger.error('MQTT connection error', { message: error.message });
  });
} else {
  logger.warn('MQTT connection skipped because MQTT_HOST is not set');
}

const publish = (topic, payload) => {
  if (!client || !client.connected) {
    logger.warn('MQTT publish skipped, client not connected', { topic });
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
    logger.info('MQTT publish', { topic, payload: message });
    client.publish(topic, message, { qos: 1 }, (err) => {
      if (err) {
        logger.error('MQTT publish failed', { topic, error: err.message });
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

const matches = (pattern, topic) => {
  const patternLevels = pattern.split('/');
  const topicLevels = topic.split('/');
  for (let i = 0; i < patternLevels.length; i += 1) {
    const patternPart = patternLevels[i];
    const topicPart = topicLevels[i];
    if (patternPart === '#') return true;
    if (patternPart === '+') {
      if (!topicPart) return false;
      continue;
    }
    if (patternPart !== topicPart) return false;
  }
  return patternLevels.length === topicLevels.length;
};

const subscribe = (topic, handler) => {
  if (!client) {
    logger.warn('MQTT subscribe skipped, client not configured', { topic });
    return;
  }
  logger.info('MQTT subscribe', { topic });
  client.subscribe(topic, { qos: 1 }, (err) => {
    if (err) {
      logger.error('MQTT subscribe failed', { topic, error: err.message });
    }
  });
  client.on('message', (incomingTopic, message) => {
    if (!matches(topic, incomingTopic)) return;
    try {
      const rawPayload = message.toString();
      logger.info('MQTT message received', { topic: incomingTopic, payload: rawPayload });
      const parsed = JSON.parse(rawPayload);
      handler(parsed, incomingTopic);
    } catch (error) {
      logger.error('MQTT message parse error', { topic: incomingTopic, error: error.message });
    }
  });
};

module.exports = { publish, subscribe, client };
