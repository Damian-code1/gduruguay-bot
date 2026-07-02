'use strict';

const mysql = require('mysql2/promise');
const config = require('../config');

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      timezone: 'Z',
      supportBigNumbers: true,
      bigNumberStrings: false,
      dateStrings: false,
      multipleStatements: false,
    });
    console.log('✅ Pool de conexiones MySQL creado');
  }
  return pool;
}

/**
 * Ejecuta una consulta parametrizada.
 * @param {string} sql
 * @param {Array<any>} params
 * @returns {Promise<[any, any]>}
 */
async function query(sql, params = []) {
  const [rows, fields] = await getPool().execute(sql, params);
  return [rows, fields];
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✅ Pool de conexiones MySQL cerrado');
  }
}

module.exports = { getPool, query, closePool };
