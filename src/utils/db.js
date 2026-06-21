const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306'),
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'gduruguay_bot',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  enableKeepAlive:    true,
  keepAliveInitialDelay: 0,
  namedPlaceholders:  false,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  timezone:           'Z',
  supportBigNumbers:  true,
  bigNumberStrings:   false,
  dateStrings:        false,
  multipleStatements: false,
});

// Devuelve [rows, fields] — usar destructuring: const [rows] = await query(...)
async function query(sql, params = []) {
  const [rows, fields] = await pool.execute(sql, params);
  return [rows, fields];
}

module.exports = { query, pool };