# 📡 RakitanDash

**DW5821e (Qualcomm Snapdragon X20) Modem Management Dashboard**

Real-time monitoring dashboard untuk modem rakitan Dell DW5821e / Foxconn T77W968 via ModemManager + AT commands.

![Node.js](https://img.shields.io/badge/Node.js-39ff14?style=for-the-badge&logo=node.js&logoColor=black)
![Express](https://img.shields.io/badge/Express-ffd700?style=for-the-badge&logo=express&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-00f0ff?style=for-the-badge&logo=sqlite&logoColor=black)
![License](https://img.shields.io/badge/MIT-39ff14?style=for-the-badge)

## 🎮 Features

| Feature | Detail |
|---|---|
| **Signal Monitoring** | RSRP, RSRQ, SINR, RSSI, Band, PCI via `AT^DEBUG?` |
| **Network Info** | Operator, Cell ID, Registration status |
| **WAN Info** | IP address, Gateway, DNS from `wwan0` interface |
| **Device Info** | IMEI, Firmware, Model, State |
| **Modem Controls** | Reboot, Disable, Enable via AT commands |
| **Carrier Aggregation** | Toggle CA on/off via `AT^CA_ENABLE` |
| **Signal History** | Canvas-based real-time chart |
| **Activity Log** | All actions logged in dashboard |

## 📦 Stack

```
Node.js + Express + SQLite + ModemManager + socat
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- ModemManager + `socat`
- DW5821e modem connected via USB

### Install

```bash
git clone https://github.com/masjeho2/rakitandash.git
cd rakitandash
npm install
```

### Config

Edit `.env`:

```env
PORT=3001
HOST=0.0.0.0
DB_PATH=./data/rakitandash.db
```

### Run

```bash
# Development
node server.js

# Production (PM2)
pm2 start server.js --name rakitandash
```

### Access

Open `http://YOUR_IP:3001`

## 🔧 Modem Setup

### DW5821e requires:

1. **ModemManager** running with MBIM driver
2. **socat** for AT command access
3. Proper USB permissions

```bash
# Install dependencies
apt install modemmanager socat

# Verify modem detected
mmcli -L
```

### AT Commands Used

| Command | Function |
|---|---|
| `AT^DEBUG?` | Full signal + network info |
| `AT^CA_ENABLE=0/1` | Enable/Disable Carrier Aggregation |
| `AT^CA_INFO?` | Get CA band info |
| `AT+CFUN=1,1` | Hard modem reboot |
| `AT+CSQ` | Signal quality |

## 📸 Dashboard

```
╔══════════════════════════════════════════════╗
║          RAKITANDASH v1.0.0                  ║
║   DW5821e Modem Dashboard                   ║
╚══════════════════════════════════════════════╝

📶 SIGNAL          🌐 NETWORK          📱 DEVICE INFO
├ RSRP: -87.4     ├ Type: LTE        ├ Model: DW5821e
├ RSRQ: -13.3     ├ Operator: XL     ├ IMEI: 863364...
├ SINR: 20 dB     ├ Cell: 293072     ├ FW: T77W968
├ Band: 3         ├ IP: 10.154...    ├ State: connected
└ RSSI: -51.5     └ DNS: 112.215...  └ Port: cdc-wdm0

🎮 CONTROLS
[🔄 REBOOT] [⏸️ DISABLE] [▶️ ENABLE]
[📶 CA ON]  [📵 CA OFF]
```

## 📁 Project Structure

```
rakitandash/
├── server.js           # Express server + API routes
├── modem-client.js     # ModemManager + AT command client
├── db.js               # SQLite database setup
├── .env                # Configuration
├── package.json
└── public/
    ├── index.html       # Dashboard UI
    ├── css/style.css    # Retro arcade theme
    └── js/app.js        # Frontend logic + charts
```

## 🔌 API

| Endpoint | Method | Description |
|---|---|---|
| `/api/dashboard` | GET | Full dashboard data |
| `/api/signal/history` | GET | Signal history for charts |
| `/api/modem/reboot` | POST | Hard reboot modem |
| `/api/modem/disable` | POST | Disable radio |
| `/api/modem/enable` | POST | Enable radio |
| `/api/modem/ca/enable` | POST | Enable Carrier Aggregation |
| `/api/modem/ca/disable` | POST | Disable CA |
| `/api/modem/ca/info` | GET | Get CA info |

## ⚠️ Notes

- **AT^DEBUG?** takes ~8 seconds (serial port access)
- Dashboard auto-refreshes every 8 seconds
- AT data cached for 15 seconds to avoid overlap
- After modem reboot, dashboard auto-reconnects (~30s)
- ModemManager index may change after reboot (auto-detected)

## 📋 License

MIT © [masjeho2](https://github.com/masjeho2)
