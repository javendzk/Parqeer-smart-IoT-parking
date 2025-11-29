const levels = ['info', 'warn', 'error'];

const logMessage = (level, message, meta = {}) => {
  const tag = levels.includes(level) ? level : 'info';
  const payload = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${new Date().toISOString()}] [${tag.toUpperCase()}] ${message}${payload}`);
};

const logger = {
  info: (message, meta) => logMessage('info', message, meta),
  warn: (message, meta) => logMessage('warn', message, meta),
  error: (message, meta) => logMessage('error', message, meta)
};

module.exports = { logger };
