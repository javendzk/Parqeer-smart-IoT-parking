const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
