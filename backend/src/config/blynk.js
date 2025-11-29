const dotenv = require('dotenv');

dotenv.config();

const blynkConfig = {
  baseUrl: process.env.BLYNK_BASE_URL,
  token: process.env.BLYNK_TOKEN,
  region: process.env.BLYNK_REGION
};

module.exports = { blynkConfig };
