const axios = require('axios');
const { parseStringPromise } = require('xml2js');

class ModemClient {
  constructor() {
    this.base = `http://${process.env.MODEM_IP || '192.168.8.1'}:${process.env.MODEM_PORT || '80'}`;
    this.sessionId = null;
  }

  // Huawei HiLink API — POST with XML body
  async apiRequest(path, body = {}) {
    try {
      const params = new URLSearchParams();
      params.append('isTest', 'false');
      for (const [k, v] of Object.entries(body)) {
        params.append(k, v);
      }
      if (this.sessionId) {
        params.append('SessionID', this.sessionId);
      }

      const res = await axios.post(`${this.base}${path}`, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 5000,
      });

      // Parse XML response
      const parsed = await parseStringPromise(res.data, { explicitArray: false });
      return parsed;
    } catch (err) {
      console.error(`[MODEM] API error at ${path}:`, err.message);
      return null;
    }
  }

  // GET XML endpoint
  async apiGet(path) {
    try {
      const res = await axios.get(`${this.base}${path}`, { timeout: 5000 });
      const parsed = await parseStringPromise(res.data, { explicitArray: false });
      return parsed;
    } catch (err) {
      console.error(`[MODEM] GET error at ${path}:`, err.message);
      return null;
    }
  }

  // Login to modem
  async login(username, password) {
    const data = await this.apiRequest('/api/user/login', {
      Username: username || process.env.MODEM_USER,
      Password: password || process.env.MODEM_PASS,
    });
    if (data?.response?.SessionID) {
      this.sessionId = data.response.SessionID;
      console.log(`[MODEM] Login OK, session: ${this.sessionId}`);
      return true;
    }
    console.log('[MODEM] Login failed, trying no-auth...');
    return false;
  }

  // Get signal info
  async getSignalInfo() {
    const data = await this.apiRequest('/api/device/signal');
    if (!data?.response) return null;
    const r = data.response;
    return {
      rssi: parseInt(r.RSSI) || 0,
      rsrp: parseInt(r.RSRP) || 0,
      rsrq: parseInt(r.RSRQ) || 0,
      sinr: parseFloat(r.SINR) || 0,
      cell_id: r.CellID || '0',
      pci: r.PCID || '0',
      band: r.EARFCN || '0',
      rscp: r.RSCP || '0',
      ecio: r.EcIo || '0',
    };
  }

  // Get device info
  async getDeviceInfo() {
    const data = await this.apiRequest('/api/device/information');
    if (!data?.response) return null;
    const r = data.response;
    return {
      device_name: r.DeviceName || 'Unknown',
      imei: r.IMEI || 'Unknown',
      mac: r.MACAddress || 'Unknown',
      ip: r.WanIPAddress || 'Unknown',
      software_version: r.SoftwareVersion || 'Unknown',
      hardware_version: r.HardwareVersion || 'Unknown',
      web_version: r.WebUIVersion || 'Unknown',
    };
  }

  // Get network info
  async getNetworkInfo() {
    const data = await this.apiRequest('/api/net/current-plmn');
    if (!data?.response) return null;
    const r = data.response;
    return {
      operator: r.OperatorName || 'Unknown',
      numeric: r.Numeric || '0',
      rat: r.RAT || 'Unknown',
      domain: r.Domain || 'Unknown',
    };
  }

  // Get data usage
  async getDataUsage() {
    const data = await this.apiRequest('/api/monitoring/traffic-statistics');
    if (!data?.response) return null;
    const r = data.response;
    return {
      current_rx: parseInt(r.CurrentDownload) || 0,
      current_tx: parseInt(r.CurrentUpload) || 0,
      total_rx: parseInt(r.TotalDownload) || 0,
      total_tx: parseInt(r.TotalUpload) || 0,
      total_duration: parseInt(r.TotalConnectTime) || 0,
    };
  }

  // Get connection status
  async getConnectionStatus() {
    const data = await this.apiRequest('/api/monitoring/status');
    if (!data?.response) return null;
    const r = data.response;
    return {
      connection_status: parseInt(r.ConnectionStatus) || 0,
      signal_strength: parseInt(r.SignalStrength) || 0,
      network_type: r.CurrentNetworkType || 'Unknown',
      wifi_status: parseInt(r.WifiStatus) || 0,
      wan_ip: r.WanIPAddress || '0.0.0.0',
      primary_dns: r.PrimaryDns || '0.0.0.0',
      secondary_dns: r.SecondaryDns || '0.0.0.0',
    };
  }

  // Get all data at once (dashboard summary)
  async getDashboardData() {
    const [signal, device, network, dataUsage, status] = await Promise.all([
      this.getSignalInfo(),
      this.getDeviceInfo(),
      this.getNetworkInfo(),
      this.getDataUsage(),
      this.getConnectionStatus(),
    ]);

    return {
      signal,
      device,
      network,
      data_usage: dataUsage,
      connection: status,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = ModemClient;
