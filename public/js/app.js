/* RakitanDash — Frontend JS */
const REFRESH_INTERVAL = 8000;
let signalHistory = [];
let prevRx = 0, prevTx = 0;

// Format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format seconds
function formatTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

// Update timestamp
function updateTime() {
  document.getElementById('update-time').textContent = new Date().toLocaleTimeString();
}

// Log activity
function addLog(msg, type = 'info') {
  const log = document.getElementById('activity-log');
  const time = new Date().toLocaleTimeString();
  const colors = { info: 'var(--text2)', ok: 'var(--green)', warn: 'var(--yellow)', err: 'var(--red)' };
  const div = document.createElement('div');
  div.style.cssText = `padding:2px 0;border-bottom:1px solid #1a1a1a;color:${colors[type] || colors.info}`;
  div.textContent = `[${time}] ${msg}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  // Keep max 50 lines
  while (log.children.length > 50) log.removeChild(log.firstChild);
}

// Signal bars updater
function updateSignalBars(rsrp) {
  const bars = document.querySelectorAll('.signal-bar');
  let level = 0;
  if (rsrp >= -80) level = 5;
  else if (rsrp >= -90) level = 4;
  else if (rsrp >= -100) level = 3;
  else if (rsrp >= -110) level = 2;
  else if (rsrp >= -120) level = 1;

  bars.forEach((bar, i) => {
    bar.className = 'signal-bar';
    if (i < level) {
      bar.classList.add(level >= 4 ? 'active' : level >= 2 ? 'medium' : 'weak');
    }
  });
}

// Simple canvas chart (no external lib)
function drawSignalChart() {
  const canvas = document.getElementById('signal-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = 150;

  const w = canvas.width;
  const h = canvas.height;
  const pad = 30;
  const data = signalHistory.slice(-60); // last 60 points

  ctx.clearRect(0, 0, w, h);

  if (data.length < 2) {
    ctx.fillStyle = '#666';
    ctx.font = '14px VT323';
    ctx.fillText('Collecting data...', w / 2 - 50, h / 2);
    return;
  }

  // Find range
  const values = data.map(d => d.rsrp).filter(v => v !== 0 && v !== null);
  if (values.length < 2) return;
  const min = Math.min(...values) - 5;
  const max = Math.max(...values) + 5;
  const range = max - min || 1;

  // Draw grid lines
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = pad + (i / 4) * (h - 2 * pad);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - 10, y);
    ctx.stroke();

    ctx.fillStyle = '#555';
    ctx.font = '11px VT323';
    ctx.fillText(Math.round(max - (i / 4) * range), 2, y + 4);
  }

  // Draw line
  ctx.beginPath();
  ctx.strokeStyle = '#39ff14';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#39ff14';
  ctx.shadowBlur = 6;

  const stepX = (w - pad - 10) / (data.length - 1);

  data.forEach((d, i) => {
    const x = pad + i * stepX;
    const y = pad + ((max - d.rsrp) / range) * (h - 2 * pad);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Draw dots
  data.forEach((d, i) => {
    const x = pad + i * stepX;
    const y = pad + ((max - d.rsrp) / range) * (h - 2 * pad);
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#39ff14';
    ctx.fill();
  });
}

// Update dashboard
async function fetchDashboard() {
  try {
    const res = await fetch('/api/dashboard');
    const data = await res.json();

    if (data.error) {
      document.getElementById('conn-status').textContent = 'OFFLINE';
      document.getElementById('conn-status').className = 'connection-badge disconnected';
      document.getElementById('status-dot').className = 'status-dot';
      addLog(`Modem unreachable: ${data.error}`, 'err');
      return;
    }

    // Online status
    document.getElementById('conn-status').textContent = 'ONLINE';
    document.getElementById('conn-status').className = 'connection-badge connected';
    document.getElementById('status-dot').className = 'status-dot online';

    // Signal
    const dbg = data.debug || {};
    const sig = data.signal || {};
    const rat = sig.rat ? sig.rat.toUpperCase() : 'LTE';

    // Use AT^DEBUG? data (real RSRP/RSRQ/SINR) — fallback to MM signal quality
    document.getElementById('rsrp-val').textContent = dbg.rsrp || sig.signal_quality + '%' || '--';
    document.getElementById('rssi-val').textContent = dbg.rssi || (sig.csq ? sig.csq + ' (' + sig.quality + ')' : '--');
    document.getElementById('rsrq-val').textContent = dbg.rsrq || '--';
    document.getElementById('sinr-val').textContent = dbg.sinr || '--';
    document.getElementById('pci-val').textContent = dbg.pci || data.network?.cell_id || '--';
    document.getElementById('band-val').textContent = dbg.band ? 'Band ' + dbg.band : rat;

    // Update signal bars from RSRP if available
    const rsrpVal = dbg.rsrp ? parseFloat(dbg.rsrp) : null;
    updateSignalBars(rsrpVal || sig.csq || 0);

    // Add to history
    signalHistory.push({
      rsrp: rsrpVal || sig.signal_quality || 0,
      rssi: dbg.rssi ? parseFloat(dbg.rssi) : sig.csq || 0,
      sinr: dbg.sinr ? parseFloat(dbg.sinr) : 0,
      time: new Date()
    });
    if (signalHistory.length > 120) signalHistory.shift();
    drawSignalChart();

    // Network
    if (data.network) {
      document.getElementById('network-type').textContent = rat;
      document.getElementById('operator-val').textContent = data.network.operator || '--';
      document.getElementById('cellid-val').textContent = dbg.enb_id || data.network.cell_id || '--';
      document.getElementById('wanip-val').textContent = data.bearer?.wan_ip || dbg.ip || '--';
      document.getElementById('dns-val').textContent = data.bearer?.dns || '--';
    }

    // Device
    if (data.modem) {
      const m = data.modem;
      document.getElementById('device-name').textContent = m.model || 'DW5821e';
      document.getElementById('imei-val').textContent = m.imei || '--';
      document.getElementById('mac-val').textContent = data.modem_type || 'Qualcomm X20';
      document.getElementById('device-ip').textContent = m.state || '--';
      document.getElementById('firmware-val').textContent = m.firmware || '--';
      document.getElementById('webui-val').textContent = dbg.bandwidth ? dbg.bandwidth + ' MHz' : 'MBIM';
    }

    // Signal quality panel
    document.getElementById('rx-speed').textContent = dbg.sinr || '--';
    document.getElementById('tx-speed').textContent = dbg.rsrq || '--';
    document.getElementById('total-rx').textContent = sig.signal_quality + '%' || '--';
    document.getElementById('total-tx').textContent = rat;
    document.getElementById('session-time').textContent = dbg.rrc || data.modem?.power_state || '--';

    updateTime();
    addLog('Dashboard updated', 'ok');
  } catch (err) {
    addLog(`Fetch error: ${err.message}`, 'err');
  }
}

// === MODEM CONTROLS ===
function setCtrlStatus(msg, type = 'info') {
  const el = document.getElementById('ctrl-status');
  const colors = { info: 'var(--text2)', ok: 'var(--green)', warn: 'var(--yellow)', err: 'var(--red)' };
  el.style.color = colors[type] || colors.info;
  el.textContent = msg;
}

async function rebootModem() {
  if (!confirm('🔄 Reboot modem sekarang?\nKoneksi akan putus ~30 detik.')) return;

  const btn = document.getElementById('btn-reboot');
  btn.disabled = true;
  btn.textContent = '⏳ REBOOTING...';
  setCtrlStatus('⏳ Rebooting modem via AT+CFUN=1,1... (~30s)', 'warn');
  addLog('Modem reboot initiated', 'warn');
  document.getElementById('conn-status').textContent = 'REBOOTING';
  document.getElementById('conn-status').className = 'connection-badge disconnected';

  try {
    const res = await fetch('/api/modem/reboot', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      setCtrlStatus('✅ ' + data.message + ' — Menunggu reconnect...', 'ok');
      addLog('Modem reboot OK: ' + data.message, 'ok');
      // Wait 30s then refresh (modem needs time)
      setTimeout(() => {
        setCtrlStatus('🔄 Refreshing dashboard...', 'warn');
        fetchDashboard();
      }, 30000);
    } else {
      setCtrlStatus('❌ Reboot failed: ' + (data.error || 'Unknown'), 'err');
      addLog('Modem reboot failed: ' + data.error, 'err');
    }
  } catch (err) {
    setCtrlStatus('❌ Error: ' + err.message, 'err');
    addLog('Reboot error: ' + err.message, 'err');
  }

  btn.disabled = false;
  btn.textContent = '🔄 REBOOT';
}

async function disableModem() {
  if (!confirm('⏸️ Disable modem?\nKoneksi akan terputus.')) return;

  const btn = document.getElementById('btn-disable');
  btn.disabled = true;
  btn.textContent = '⏳ DISABLING...';
  setCtrlStatus('Disabling modem...', 'warn');
  addLog('Modem disable requested', 'warn');

  try {
    const res = await fetch('/api/modem/disable', { method: 'POST' });
    const data = await res.json();
    setCtrlStatus(data.success ? '✅ Modem disabled' : '❌ Failed', data.success ? 'ok' : 'err');
    addLog(data.message || 'Modem disabled', 'ok');
  } catch (err) {
    setCtrlStatus('❌ Error: ' + err.message, 'err');
    addLog('Disable error: ' + err.message, 'err');
  }

  btn.disabled = false;
  btn.textContent = '⏸️ DISABLE';
}

async function enableModem() {
  const btn = document.getElementById('btn-enable');
  btn.disabled = true;
  btn.textContent = '⏳ ENABLING...';
  setCtrlStatus('Enabling modem...', 'warn');
  addLog('Modem enable requested', 'warn');

  try {
    const res = await fetch('/api/modem/enable', { method: 'POST' });
    const data = await res.json();
    setCtrlStatus(data.success ? '✅ Modem enabled' : '❌ Failed', data.success ? 'ok' : 'err');
    addLog(data.message || 'Modem enabled', 'ok');
    // Refresh after 5s
    setTimeout(() => { fetchDashboard(); }, 5000);
  } catch (err) {
    setCtrlStatus('❌ Error: ' + err.message, 'err');
    addLog('Enable error: ' + err.message, 'err');
  }

  btn.disabled = false;
  btn.textContent = '▶️ ENABLE';
}

// === SMS FUNCTIONS ===
async function refreshSMS() {
  const btn = document.getElementById('btn-sms-refresh');
  btn.disabled = true;
  btn.textContent = '⏳ LOADING...';
  
  try {
    // Get storage info
    const storageRes = await fetch('/api/sms/storage');
    const storage = await storageRes.json();
    document.getElementById('sms-storage-info').textContent = 
      storage.used !== undefined ? `Storage: ${storage.used}/${storage.total} messages` : 'Storage: --';

    // Get all SMS
    const smsRes = await fetch('/api/sms');
    const smsList = await smsRes.json();
    
    const container = document.getElementById('sms-list');
    if (smsList.length === 0) {
      container.innerHTML = '<div style="color:var(--text2);padding:8px 0">No SMS messages</div>';
    } else {
      container.innerHTML = smsList.map(sms => `
        <div class="sms-item ${sms.status.includes('UNREAD') ? 'unread' : ''}">
          <div class="sms-header">
            <span class="sms-sender">📱 ${sms.sender}</span>
            <span class="sms-time">${sms.timestamp || '--'}</span>
          </div>
          <div class="sms-body">${sms.body}</div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span class="sms-status ${sms.status.includes('READ') ? 'read' : ''}">${sms.status}</span>
            <button class="ctrl-btn ctrl-red" style="font-size:8px;padding:4px 8px" onclick="deleteSMS(${sms.index})">🗑️</button>
          </div>
        </div>
      `).join('');
    }
    addLog(`SMS: ${smsList.length} messages loaded`, 'ok');
  } catch (err) {
    addLog('SMS refresh error: ' + err.message, 'err');
  }
  btn.disabled = false;
  btn.textContent = '📥 REFRESH';
}

async function deleteSMS(index) {
  if (!confirm('Hapus SMS ini?')) return;
  try {
    await fetch('/api/sms/' + index, { method: 'DELETE' });
    addLog('SMS #' + index + ' deleted', 'ok');
    refreshSMS();
  } catch (err) {
    addLog('Delete error: ' + err.message, 'err');
  }
}

async function deleteAllSMS() {
  if (!confirm('🗑️ Hapus SEMUA SMS?')) return;
  try {
    await fetch('/api/sms', { method: 'DELETE' });
    addLog('All SMS deleted', 'ok');
    refreshSMS();
  } catch (err) {
    addLog('Delete all error: ' + err.message, 'err');
  }
}

// Auto-refresh SMS every 30 seconds
setInterval(refreshSMS, 30000);

// Init
document.addEventListener('DOMContentLoaded', () => {
  addLog('RakitanDash v1.0 initialized');
  fetchDashboard();
  refreshSMS();
  setInterval(fetchDashboard, REFRESH_INTERVAL);

  // Resize chart on window resize
  window.addEventListener('resize', drawSignalChart);
});
