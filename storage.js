const fs = require('node:fs');
const path = require('node:path');

const dataDirectory = path.join(__dirname, 'data');
const dataFiles = {
  products: path.join(dataDirectory, 'products.json'),
  orders: path.join(dataDirectory, 'orders.json'),
  users: path.join(dataDirectory, 'users.json'),
  sessions: path.join(dataDirectory, 'sessions.json'),
  reports: path.join(dataDirectory, 'reports.json'),
  articles: path.join(dataDirectory, 'articles.json'),
  commission: path.join(dataDirectory, 'commission.json'),
  settlements: path.join(dataDirectory, 'settlements.json'),
  categories: path.join(dataDirectory, 'categories.json'),
  notifications: path.join(dataDirectory, 'notifications.json'),
  templates: path.join(dataDirectory, 'templates.json'),
  reviews: path.join(dataDirectory, 'reviews.json'),
  announcements: path.join(dataDirectory, 'announcements.json'),
  retailerReports: path.join(dataDirectory, 'retailerReports.json'),
};

const names = Object.keys(dataFiles);
const fileToName = Object.fromEntries(names.map((name) => [dataFiles[name], name]));
const cache = {};
const fileStorageEnabled = process.env.PLATIFUL_TEST_MODE === '1';
const importJsonSeed = process.env.PLATIFUL_IMPORT_JSON_SEED !== 'false';
const clone = (value) => JSON.parse(JSON.stringify(value));
const readJsonFile = (file) => (fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, 'utf8'))
  : []);

let adapter = null;
let mysqlPool = null;
let postgresPool = null;
let writeQueue = Promise.resolve();
let storageError = null;

async function initPostgres() {
  const { Pool } = require('pg');
  const ssl = process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined;
  postgresPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl,
    max: Number(process.env.DB_POOL_SIZE) || 5,
  });
  await postgresPool.query('SELECT 1');
  await postgresPool.query(
    'CREATE TABLE IF NOT EXISTS "_seeded" (name VARCHAR(64) PRIMARY KEY)',
  );
  adapter = 'PostgreSQL';
  const { rows: seededRows } = await postgresPool.query('SELECT name FROM "_seeded"');
  const seeded = new Set(seededRows.map((row) => row.name));

  for (const name of names) {
    await postgresPool.query(
      `CREATE TABLE IF NOT EXISTS "${name}" (` +
      'row_no INTEGER PRIMARY KEY, id VARCHAR(64), data JSONB NOT NULL)',
    );
    if (seeded.has(name)) {
      const { rows } = await postgresPool.query(
        `SELECT data FROM "${name}" ORDER BY row_no`,
      );
      cache[name] = rows.map((row) => (
        typeof row.data === 'string' ? JSON.parse(row.data) : row.data
      ));
      continue;
    }

    cache[name] = importJsonSeed ? readJsonFile(dataFiles[name]) : [];
    await persist(name);
    await flush();
    await postgresPool.query(
      'INSERT INTO "_seeded" (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [name],
    );
  }
  console.log('[Storage] Connected to PostgreSQL.');
}

async function initMysql() {
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch {
    throw new Error('Install mysql2 or configure DATABASE_URL for PostgreSQL.');
  }

  const dbName = process.env.DB_NAME || 'tubes_ppl';
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  };
  const boot = await mysql.createConnection(dbConfig);
  try {
    await boot.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4`);
  } finally {
    await boot.end();
  }

  mysqlPool = mysql.createPool({ ...dbConfig, database: dbName, connectionLimit: 5 });
  await mysqlPool.query('CREATE TABLE IF NOT EXISTS `_seeded` (name VARCHAR(64) PRIMARY KEY)');
  adapter = 'MySQL';
  const [seededRows] = await mysqlPool.query('SELECT name FROM `_seeded`');
  const seeded = new Set(seededRows.map((row) => row.name));

  for (const name of names) {
    await mysqlPool.query(
      `CREATE TABLE IF NOT EXISTS \`${name}\` (` +
      'row_no INT NOT NULL PRIMARY KEY, id VARCHAR(64) NULL, data JSON NOT NULL, ' +
      'INDEX idx_id (id)) CHARACTER SET utf8mb4',
    );
    if (seeded.has(name)) {
      const [rows] = await mysqlPool.query(`SELECT data FROM \`${name}\` ORDER BY row_no`);
      cache[name] = rows.map((row) => (
        typeof row.data === 'string' ? JSON.parse(row.data) : row.data
      ));
      continue;
    }

    cache[name] = readJsonFile(dataFiles[name]);
    await persist(name);
    await flush();
    await mysqlPool.query('INSERT IGNORE INTO `_seeded` (name) VALUES (?)', [name]);
  }
  console.log(`[Storage] Connected to MySQL database "${dbName}" at ${dbConfig.host}:${dbConfig.port}.`);
}

async function persistPostgres(name) {
  const client = await postgresPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM "${name}"`);
    const rows = cache[name];
    if (rows.length) {
      const values = [];
      const placeholders = rows.map((row, index) => {
        const offset = index * 3;
        values.push(index, row && row.id ? String(row.id).slice(0, 64) : null, JSON.stringify(row));
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}::jsonb)`;
      });
      await client.query(
        `INSERT INTO "${name}" (row_no, id, data) VALUES ${placeholders.join(',')}`,
        values,
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function persistMysql(name) {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(`DELETE FROM \`${name}\``);
    const rows = cache[name];
    if (rows.length) {
      await connection.query(`INSERT INTO \`${name}\` (row_no, id, data) VALUES ?`, [
        rows.map((row, index) => [
          index,
          row && row.id ? String(row.id).slice(0, 64) : null,
          JSON.stringify(row),
        ]),
      ]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function persist(name) {
  const operation = writeQueue.then(async () => {
    if (adapter === 'PostgreSQL') await persistPostgres(name);
    else if (adapter === 'MySQL') await persistMysql(name);
    storageError = null;
  });
  writeQueue = operation.catch((error) => {
    storageError = error;
    console.error(`[Storage] Failed to persist ${name}: ${error.message}`);
  });
  return writeQueue;
}

async function init() {
  if (fileStorageEnabled) {
    for (const name of names) cache[name] = readJsonFile(dataFiles[name]);
    adapter = 'JSON';
    console.log('[Storage] Isolated test mode is using temporary JSON files.');
    return;
  }
  if (process.env.DATABASE_URL) {
    await initPostgres();
    return;
  }
  await initMysql();
}

function ensureDataFiles() {
  fs.mkdirSync(dataDirectory, { recursive: true });
}

function readData(filePath) {
  const name = fileToName[filePath];
  if (!name || !Object.hasOwn(cache, name)) {
    throw new Error('Database belum siap (init belum dipanggil).');
  }
  return clone(cache[name]);
}

function writeData(filePath, value) {
  const name = fileToName[filePath];
  if (!name) throw new Error('Unknown storage data file.');
  cache[name] = clone(value);
  if (fileStorageEnabled) {
    fs.writeFileSync(filePath, JSON.stringify(cache[name], null, 2));
    return Promise.resolve();
  }
  return persist(name);
}

function getStorageStatus() {
  return { adapter, error: storageError };
}

async function checkStorage() {
  if (storageError) throw storageError;
  if (postgresPool) await postgresPool.query('SELECT 1');
  else if (mysqlPool) await mysqlPool.query('SELECT 1');
}

async function flush() {
  await writeQueue;
  if (storageError) throw storageError;
}

async function close() {
  await flush();
  if (postgresPool) await postgresPool.end();
  if (mysqlPool) await mysqlPool.end();
}

module.exports = {
  close,
  checkStorage,
  dataFiles,
  ensureDataFiles,
  flush,
  getStorageStatus,
  init,
  readData,
  writeData,
};
