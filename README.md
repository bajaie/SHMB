# VitalSense v2.0: Hybrid Tracking & Health Dashboard

VitalSense is a professional-grade wearable IoT system built for high-reliability health and location monitoring. Version 2.0 introduces the **Triple-Tier Hybrid Tracking System**, ensuring location awareness even in GPS-blind environments (indoors).

## 🚀 Accomplishments So Far

### 1. SmartBand Firmware (v2.0)
- **Hybrid Location Core**: A priority-based system:
  1. **Satellite Fix**: Live NEO-6M GPS data.
  2. **Mobile Assist**: Phone-synced GPS coordinates via BLE.
  3. **Memory Fallback**: Persistent Flash storage of the last known position.
- **Safety Filters**: Professional-grade Low Pass Filters (LPF) for stable Heart Rate and Motion (Pitch/Roll) readings.
- **Bi-Directional BLE**: Split-pipe communication for reliable telemetry and incoming calibration commands.
- **Hardware Integration**: Full support for MLX90614 (Temp), MPU6050 (Motion), MAX30102 (HR/SPO2), and SSD1306 (OLED).

### 2. Mobile Dashboard App (v2.0)
- **Real-time Telemetry**: Live visualization of HR, SPO2, Body Temp, and Motion.
- **Active Calibration**: One-tap "CALIBRATE NOW" button to seed the SmartBand with Phone GPS coordinates.
- **Auto-Sync**: Background heartbeat to ensure the connection stays alive and coordinates stay updated.
- **Hybrid Map Integration**: Capability to display both device and phone location data.

---

## 🍏 macOS Environment Setup

To set up a fresh development machine, follow these steps:

1. **Clone the Project**:
   ```bash
   git clone https://github.com/bajaie/SHMB.git
   cd SHMB
   ```

2. **Run Master Setup**:
   This script installs Homebrew, Node.js, Java 17, Android SDK, Arduino CLI, and all sensor libraries.
   ```bash
   chmod +x mac_pro_setup.sh
   ./mac_pro_setup.sh
   ```

---

## 🛠 Deployment & Testing

### Flash the SmartBand (Firmware)
Connect the ESP32 via USB and run:
```bash
chmod +x flash_v2.sh
./flash_v2.sh
```

### Live Mobile Deploy (App)
Connect your Android phone via USB (with Debugging enabled) and run:
```bash
chmod +x live_deploy.sh
./live_deploy.sh
```

---

## 📦 Hardware Requirements
- **MCU**: ESP32-C3-MINI
- **GPS**: NEO-6M
- **Sensors**: MPU6050, MLX90614, MAX30102
- **Display**: SSD1306 OLED (128x64)

---
**Version**: 2.0.0  
**Author**: bajaie  
**License**: Private  
