require('dotenv').config();
const express = require('express');
const path = require('path');
const ModemClient = require('./modem-client');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const modem = new ModemClient();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes

// GET /api/dashboard — full dashboard data
app.get('/api/dashboard', async (req, res) => {
  try {
    const data = await modem.getDashboardData();
    if (!data.signal && !data.device) {
      return res.json({ error: 'Modem unreachable', modem_ip: process.env.MODEM_IP });
    }

    // Log signal
    if (data.signal) {
      try {
        db.prepare(`INSERT INTO signal_log (rssi, rsrp, rsrq, sinr, cell_id, pci, band, network_type, operator)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          data.signal.rssi, data.signal.rsrp, data.signal.rsrq,
          data.signal.sinr, data.signal.cell_id, data.signal.pci,
          data.signal.band, data.network?.rat || '', data.network?.operator || ''
        );
      } catch (e) { /* ignore log errors */ }
    }

    // Log data usage
    if (data.data_usage) {
      try {
        db.prepare(`INSERT INTO data_log (rx_bytes, tx_bytes) VALUES (?, ?)`).run(
          data.data_usage.current_rx, data.data_usage.current_tx
        );
      } catch (e) { /* ignore */ }
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/signal/history — signal history for charts
app.get('/api/signal/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const rows = db.prepare(`SELECT * FROM signal_log ORDER BY id DESC LIMIT ?`).all(limit);
  res.json(rows.reverse());
});

// GET /api/data/history — data usage history
app.get('/api/data/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const rows = db.prepare(`SELECT * FROM data_log ORDER BY id DESC LIMIT ?`).all(limit);
  res.json(rows.reverse());
});

// GET /api/signal — current signal only
app.get('/api/signal', async (req, res) => {
  const signal = await modem.getSignalInfo();
  res.json(signal || { error: 'Modem unreachable' });
});

// GET /api/device — device info only
app.get('/api/device', async (req, res) => {
  const device = await modem.getDeviceInfo();
  res.json(device || { error: 'Modem unreachable' });
});

// GET /api/network — network info
app.get('/api/network', async (req, res) => {
  const network = await modem.getNetworkInfo();
  res.json(network || { error: 'Modem unreachable' });
});

// GET /api/data — data usage
app.get('/api/data', async (req, res) => {
  const data = await modem.getDataUsage();
  res.json(data || { error: 'Modem unreachable' });
});

// GET /api/connection — connection status
app.get('/api/connection', async (req, res) => {
  const status = await modem.getConnectionStatus();
  res.json(status || { error: 'Modem unreachable' });
});

// POST /api/login — manual login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const ok = await modem.login(username, password);
  res.json({ success: ok });
});

// GET /api/settings
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  res.json(settings);
});

// POST /api/settings
app.post('/api/settings', (req, res) => {
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
  const stmt = db.transaction((entries) => {
    for (const [k, v] of entries) update.run(k, v);
  });
  stmt(Object.entries(req.body));
  res.json({ success: true });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start
app.listen(PORT, HOST, async () => {
  console.log(`
╔══════════════════════════════════════════════╗
║          RAKITANDASH v1.0.0                  ║
║   DW5820E Modem Management Dashboard        ║
║   http://${HOST}:${PORT}                       ║
╚══════════════════════════════════════════════╝
  `);

  // Auto-login
  const ok = await modem.login();
  if (ok) {
    console.log('[RAKITANDASH] Modem login OK');
  } else {
    console.log('[RAKITANDASH] Modem login failed — check IP/user/pass in .env');
  }
});
