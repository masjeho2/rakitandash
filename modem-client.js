const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class ModemClient {
  constructor() {
    this.modemIndex = null;
    this.serialPort = null;
  }

  async run(cmd, timeout = 8000) {
    try {
      const { stdout } = await execAsync(cmd, { timeout });
      return stdout.trim().replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
    } catch (err) { return null; }
  }

  async detectModem() {
    const list = await this.run('mmcli -L 2>/dev/null');
    if (!list) return null;
    const match = list.match(/Modem\/(\d+)/);
    if (match) {
      this.modemIndex = parseInt(match[1]);
      await this.detectSerialPort();
      return this.modemIndex;
    }
    return null;
  }

  async detectSerialPort() {
    if (!this.modemIndex) return null;
    const raw = await this.run(`mmcli -m ${this.modemIndex} 2>/dev/null`);
    const portsMatch = raw?.match(/ports:\s*(.+)/);
    if (portsMatch) {
      const ports = portsMatch[1].split(',').map(p => p.trim());
      const atPort = ports.find(p => p.includes('ttyUSB') && p.includes('at'));
      if (atPort) {
        const portName = atPort.match(/\/dev\/\w+/)?.[0];
        if (portName) { this.serialPort = portName; return this.serialPort; }
      }
    }
    for (const p of ['/dev/ttyUSB0', '/dev/ttyUSB1']) {
      const exists = await this.run(`test -e ${p} && echo yes`);
      if (exists === 'yes') { this.serialPort = p; return this.serialPort; }
    }
    return null;
  }

  async sendAT(command) {
    if (!this.modemIndex) await this.detectModem();
    if (!this.modemIndex) return 'NO_MODEM';
    if (!this.serialPort) await this.detectSerialPort();
    if (!this.serialPort) return 'NO_SERIAL';

    while (this._atBusy) await this.run('sleep 1');
    this._atBusy = true;
    try {
      await this.run(`mmcli -m ${this.modemIndex} --disable 2>/dev/null`);
      await this.run('sleep 1.5');
      const result = await this.run(
        `echo -e "${command}\\r" | timeout 5 socat - ${this.serialPort},raw,echo=0,b115200 2>/dev/null`, 10000
      );
      await this.run(`mmcli -m ${this.modemIndex} --enable 2>/dev/null`);
      await this.run('sleep 3');
      return result || 'NO_RESPONSE';
    } finally { this._atBusy = false; }
  }

  parseDebugInfo(raw) {
    if (!raw || ['NO_MODEM','NO_RESPONSE','NO_SERIAL'].includes(raw)) return null;
    const info = {};
    const p = {
      band: /BAND:\s*(\d+)/, bandwidth: /BW:\s*([\d.]+)\s*MHz/,
      plmn: /PLMN:\s*(.+)/, tac: /TAC:\s*(\d+)/,
      enb_id: /eNB ID\(PCI\):\s*(\S+)/,
      rsrp: /RSRP:\s*(-?[\d.]+)dBm/, rsrq: /RSRQ:\s*(-?[\d.]+)dB/,
      rssi: /RSSI:\s*(-?[\d.]+)dBm/, sinr: /RS-SINR:\s*(-?[\d.]+)dB/,
      cqi: /CQI:\s*(\d+)/, ri: /RI:\s*(\d+)/,
      status: /STATUS:\s*(\S+)/, sub_status: /SUB STATUS:\s*(.+)/,
      rrc: /RRC Status:\s*(\S+)/, ip: /IP:\s*(\S+)/,
      avg_rsrp: /AVG RSRP:\s*(-?[\d.]+)dBm/,
    };
    for (const [k, r] of Object.entries(p)) { const m = raw.match(r); if (m) info[k] = m[1]; }
    const pciMatch = raw.match(/\((\d+)\)/); if (pciMatch) info.pci = pciMatch[1];
    return Object.keys(info).length > 0 ? info : null;
  }

  parseCAInfo(raw) {
    if (!raw || ['NO_MODEM','NO_RESPONSE','NO_SERIAL'].includes(raw)) return null;
    // AT^CA_INFO? returns enabled bands + CA status
    const info = { raw, enabled: raw.includes('ENABLED') || raw.includes('1'), bands: [] };
    const bandMatch = raw.match(/BANDS?:\s*(.+)/i);
    if (bandMatch) info.bands = bandMatch[1].split(/[,\s]+/).filter(Boolean);
    // Check if CA is active
    const caMatch = raw.match(/CA[_\s]*STATUS:\s*(\S+)/i);
    if (caMatch) info.ca_status = caMatch[1];
    return info;
  }

  // === MODEM COMMANDS ===

  async reboot() {
    if (!this.modemIndex) await this.detectModem();
    if (!this.modemIndex) return { success: false, error: 'Modem not detected' };
    console.log(`[MODEM] Rebooting modem index ${this.modemIndex}...`);
    await this.run(`mmcli -m ${this.modemIndex} --disable 2>/dev/null`);
    await this.run('sleep 1.5');
    const atPort = this.serialPort || '/dev/ttyUSB0';
    const result = await this.run(
      `echo -e "AT+CFUN=1,1\\r" | timeout 3 socat - ${atPort},raw,echo=0,b115200 2>/dev/null`, 8000
    );
    console.log(`[MODEM] AT: ${result}`);
    console.log('[MODEM] Waiting 25s for reboot...');
    await this.run('sleep 25');
    this.modemIndex = null; this.serialPort = null;
    await this.detectModem();
    if (!this.modemIndex) { await this.run('sleep 15'); await this.detectModem(); }
    if (this.modemIndex) {
      await this.run(`mmcli -m ${this.modemIndex} --enable 2>/dev/null`);
      await this.run('sleep 5');
      this._debugCache = null; this._debugCacheTime = 0;
      return { success: true, message: `Reboot OK, modem index: ${this.modemIndex}` };
    }
    return { success: false, error: 'Modem did not come back' };
  }

  async disableRadio() {
    if (!this.modemIndex) await this.detectModem();
    if (!this.modemIndex) return { success: false, error: 'No modem' };
    const r = await this.run(`mmcli -m ${this.modemIndex} --disable 2>&1`);
    return { success: r?.includes('success'), message: r || 'OK' };
  }

  async enableRadio() {
    if (!this.modemIndex) await this.detectModem();
    if (!this.modemIndex) return { success: false, error: 'No modem' };
    const r = await this.run(`mmcli -m ${this.modemIndex} --enable 2>&1`);
    return { success: r?.includes('success'), message: r || 'OK' };
  }

  // Enable Carrier Aggregation (AT^CA_ENABLE=0 = ON, 1 = OFF)
  async enableCA() {
    const result = await this.sendAT('AT^CA_ENABLE=0');
    return { success: !result?.includes('ERROR'), message: 'CA Enabled', at_response: result };
  }

  // Disable Carrier Aggregation
  async disableCA() {
    const result = await this.sendAT('AT^CA_ENABLE=1');
    return { success: !result?.includes('ERROR'), message: 'CA Disabled', at_response: result };
  }

  // Get CA info
  async getCAInfo() {
    const raw = await this.sendAT('AT^CA_INFO?');
    return this.parseCAInfo(raw);
  }

  // === GETTERS ===

  async getSignalFromMM() {
    if (!this.modemIndex) await this.detectModem();
    if (!this.modemIndex) return null;
    const raw = await this.run(`mmcli -m ${this.modemIndex} 2>/dev/null`);
    if (!raw) return null;
    const info = {};
    for (const l of raw.split('\n')) { const m = l.match(/\|\s+([\w\s\/()-]+)\s*:\s+(.+)/); if (m) info[m[1].trim()] = m[2].trim(); }
    const sq = parseInt(info['signal quality']) || 0;
    return { signal_quality: sq, csq: Math.round(sq * 31 / 100), rat: info['access tech'] || 'unknown',
      quality: sq >= 80 ? 'Excellent' : sq >= 60 ? 'Good' : sq >= 40 ? 'Fair' : sq >= 20 ? 'Weak' : 'Poor' };
  }

  async getDeviceInfo() {
    if (!this.modemIndex) await this.detectModem();
    if (!this.modemIndex) return null;
    const raw = await this.run(`mmcli -m ${this.modemIndex} 2>/dev/null`);
    if (!raw) return null;
    const info = {};
    for (const l of raw.split('\n')) { const m = l.match(/\|\s+([\w\s\/()-]+)\s*:\s+(.+)/); if (m) info[m[1].trim()] = m[2].trim(); }
    return { manufacturer: info['manufacturer'] || 'Dell', model: info['model'] || 'DW5821e',
      firmware: info['firmware revision'] || 'Unknown', imei: info['equipment id'] || 'Unknown',
      state: info['state'] || 'unknown', power_state: info['power state'] || 'unknown',
      signal_quality: info['signal quality'] || '0%', access_tech: info['access tech'] || 'unknown' };
  }

  async getNetworkInfo() {
    if (!this.modemIndex) await this.detectModem();
    if (!this.modemIndex) return null;
    const raw = await this.run(`mmcli -m ${this.modemIndex} 2>/dev/null`);
    if (!raw) return null;
    const info = {};
    for (const l of raw.split('\n')) { const m = l.match(/\|\s+([\w\s\/()-]+)\s*:\s+(.+)/); if (m) info[m[1].trim()] = m[2].trim(); }
    return { operator: info['operator name'] || 'Unknown', operator_id: info['operator id'] || '0',
      registration: info['registration'] || 'unknown', cell_id: info['cell id'] || '0',
      apn: info['initial bearer apn'] || 'internet' };
  }

  async getBearer() {
    const ipRaw = await this.run('ip addr show wwan0 2>/dev/null | grep "inet "');
    const wanIp = ipRaw?.match(/inet\s+(\S+)/)?.[1]?.split('/')[0] || '--';
    const gwRaw = await this.run('ip route show default dev wwan0 2>/dev/null');
    const gateway = gwRaw?.match(/via\s+(\S+)/)?.[1] || '--';
    const dnsRaw = await this.run('resolvectl status wwan0 2>/dev/null | grep -A1 "DNS Servers"');
    const dns = dnsRaw?.replace('DNS Servers:', '').trim() || '--';
    return { wan_ip: wanIp, gateway, dns };
  }

  async getDashboardData() {
    if (!this.modemIndex) await this.detectModem();
    const [modemInfo, signal, network, bearer] = await Promise.all([
      this.getDeviceInfo(), this.getSignalFromMM(), this.getNetworkInfo(), this.getBearer()
    ]);
    let debugInfo = this._debugCache || null;
    const now = Date.now();
    if (!this._debugCache || (now - this._debugCacheTime) > 15000) {
      try {
        const raw = await this.sendAT('AT^DEBUG?');
        debugInfo = this.parseDebugInfo(raw);
        if (debugInfo) { this._debugCache = debugInfo; this._debugCacheTime = now; }
      } catch (e) { console.log('[MODEM] AT^DEBUG? failed:', e.message); }
    }
    return { modem: modemInfo, signal, network, bearer, debug: debugInfo,
      modem_type: 'DW5821e (Qualcomm Snapdragon X20)',
      interface: 'MBIM + AT via ModemManager', timestamp: new Date().toISOString() };
  }
}

module.exports = ModemClient;
