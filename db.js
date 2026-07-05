const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.dirname(process.env.DB_PATH || './data/rakitandash.db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(process.env.DB_PATH || './data/rakitandash.db');

// WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS signal_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    rssi INTEGER,
    rsrp INTEGER,
    rsrq INTEGER,
    sinr REAL,
    cell_id TEXT,
    pci TEXT,
    band TEXT,
    network_type TEXT,
    operator TEXT
  );

  CREATE TABLE IF NOT EXISTS data_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    rx_bytes INTEGER,
    tx_bytes INTEGER,
    rx_speed REAL,
    tx_speed REAL
  );

  CREATE TABLE IF NOT EXISTS device_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    imei TEXT,
    iccid TEXT,
    model TEXT,
    firmware TEXT,
    mac TEXT,
    ip TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Insert default settings
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
insertSetting.run('modem_ip', process.env.MODEM_IP || '192.168.8.1');
insertSetting.run('modem_port', process.env.MODEM_PORT || '80');
insertSetting.run('modem_user', process.env.MODEM_USER || 'admin');
insertSetting.run('modem_pass', process.env.MODEM_PASS || 'admin');
insertSetting.run('auto_refresh', '5');
insertSetting.run('theme', 'retro');

module.exports = db;
