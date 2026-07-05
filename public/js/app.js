/* RakitanDash — Frontend JS */
const REFRESH_INTERVAL = 5000;
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
    if (data.signal) {
      const s = data.signal;
      document.getElementById('rsrp-val').textContent = s.rsrp;
      document.getElementById('rssi-val').textContent = s.rssi + ' dBm';
      document.getElementById('rsrq-val').textContent = s.rsrq + ' dB';
      document.getElementById('sinr-val').textContent = s.sinr + ' dB';
      document.getElementById('pci-val').textContent = s.pci;
      document.getElementById('band-val').textContent = 'Band ' + s.band;
      updateSignalBars(s.rsrp);

      // Add to history
      signalHistory.push({ rsrp: s.rsrp, rssi: s.rssi, sinr: s.sinr, time: new Date() });
      if (signalHistory.length > 120) signalHistory.shift();
      drawSignalChart();
    }

    // Network
    if (data.network) {
      document.getElementById('network-type').textContent = data.network.rat;
      document.getElementById('operator-val').textContent = data.network.operator;
    }

    // Connection
    if (data.connection) {
      const c = data.connection;
      document.getElementById('cellid-val').textContent = data.signal?.cell_id || '--';
      document.getElementById('wanip-val').textContent = c.wan_ip;
      document.getElementById('dns-val').textContent = c.primary_dns;
    }

    // Device
    if (data.device) {
      const d = data.device;
      document.getElementById('device-name').textContent = d.device_name;
      document.getElementById('imei-val').textContent = d.imei;
      document.getElementById('mac-val').textContent = d.mac;
      document.getElementById('device-ip').textContent = d.ip;
      document.getElementById('firmware-val').textContent = d.software_version;
      document.getElementById('webui-val').textContent = d.web_version;
    }

    // Data usage
    if (data.data_usage) {
      const du = data.data_usage;

      // Calculate speed (bytes diff / interval)
      if (prevRx > 0) {
        const rxSpeed = (du.current_rx - prevRx) / (REFRESH_INTERVAL / 1000);
        const txSpeed = (du.current_tx - prevTx) / (REFRESH_INTERVAL / 1000);
        document.getElementById('rx-speed').textContent = formatBytes(rxSpeed) + '/s';
        document.getElementById('tx-speed').textContent = formatBytes(txSpeed) + '/s';
      }
      prevRx = du.current_rx;
      prevTx = du.current_tx;

      document.getElementById('total-rx').textContent = formatBytes(du.total_rx);
      document.getElementById('total-tx').textContent = formatBytes(du.total_tx);
      document.getElementById('session-time').textContent = formatTime(du.total_duration);
    }

    updateTime();
    addLog('Dashboard updated', 'ok');
  } catch (err) {
    addLog(`Fetch error: ${err.message}`, 'err');
  }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  addLog('RakitanDash v1.0 initialized');
  fetchDashboard();
  setInterval(fetchDashboard, REFRESH_INTERVAL);

  // Resize chart on window resize
  window.addEventListener('resize', drawSignalChart);
});
