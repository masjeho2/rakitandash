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
          data.signal.csq || 0,
          data.signal.rsrp || 0,
          data.signal.rsrq || 0,
          data.signal.sinr || 0,
          data.network?.cell_id || '0',
          '0',
          data.signal.rat || '0',
          data.signal.rat || '',
          data.network?.operator || ''
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

// POST /api/login — detect modem
app.post('/api/login', async (req, res) => {
  const port = await modem.detectModem();
  res.json({ success: !!port, port });
});

// POST /api/modem/reboot — reboot modem
app.post('/api/modem/reboot', async (req, res) => {
  console.log('[RAKITANDASH] Modem reboot requested!');
  const result = await modem.reboot();
  res.json(result);
});

// POST /api/modem/disable — disable modem via AT
app.post('/api/modem/disable', async (req, res) => {
  const result = await modem.disableRadio();
  res.json(result);
});

// POST /api/modem/enable — enable modem via AT
app.post('/api/modem/enable', async (req, res) => {
  const result = await modem.enableRadio();
  res.json(result);
});

// POST /api/modem/ca/enable — enable Carrier Aggregation
app.post('/api/modem/ca/enable', async (req, res) => {
  const result = await modem.enableCA();
  res.json(result);
});

// POST /api/modem/ca/disable — disable Carrier Aggregation
app.post('/api/modem/ca/disable', async (req, res) => {
  const result = await modem.disableCA();
  res.json(result);
});

// GET /api/modem/ca/info — get CA info
app.get('/api/modem/ca/info', async (req, res) => {
  const result = await modem.getCAInfo();
  res.json(result || { error: 'No CA info' });
});

// === SMS ROUTES ===

// GET /api/sms — read all SMS
app.get('/api/sms', async (req, res) => {
  const sms = await modem.readSMS();
  res.json(sms);
});

// GET /api/sms/unread — read unread SMS only
app.get('/api/sms/unread', async (req, res) => {
  const sms = await modem.readUnreadSMS();
  res.json(sms);
});

// POST /api/sms/send — send SMS
app.post('/api/sms/send', async (req, res) => {
  const { number, message } = req.body;
  if (!number || !message) return res.json({ success: false, error: 'Number and message required' });
  const result = await modem.sendSMS(number, message);
  res.json(result);
});

// DELETE /api/sms/:index — delete SMS by index
app.delete('/api/sms/:index', async (req, res) => {
  const result = await modem.deleteSMS(parseInt(req.params.index));
  res.json(result);
});

// DELETE /api/sms — delete all SMS
app.delete('/api/sms', async (req, res) => {
  const result = await modem.deleteAllSMS();
  res.json(result);
});

// GET /api/sms/storage — SMS storage info
app.get('/api/sms/storage', async (req, res) => {
  const storage = await modem.getSMSStorage();
  res.json(storage || { error: 'No storage info' });
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
║   DW5821e Modem Management Dashboard        ║
║   http://${HOST}:${PORT}                       ║
╚══════════════════════════════════════════════╝
  `);

  // Auto-detect modem serial port
  const port = await modem.detectModem();
  if (port !== null) {
    console.log(`[RAKITANDASH] Modem detected: ${port}`);
  } else {
    console.log('[RAKITANDASH] No modem serial port found (/dev/ttyUSB*)');
    console.log('[RAKITANDASH] Connect DW5821e modem via USB');
  }
});
