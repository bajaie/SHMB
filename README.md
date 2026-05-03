# SHMB v3.5.8: Smart Health Medical Band Platform

SHMB is a professional-grade wearable IoT system designed for critical health monitoring and real-time location tracking. This repository contains the streamlined production code for both the mobile dashboard and the ESP32-C3 hardware.

## 📂 Repository Structure

- **[shmb_app/](file:///Users/dev/Downloads/SHMB/shmb_app)**: The final Mobile Dashboard application (React + Capacitor + Vite).
- **[shmb_esp32_firmware/](file:///Users/dev/Downloads/SHMB/shmb_esp32_firmware)**: The professional-grade ESP32-C3 firmware.
- **[documentation/](file:///Users/dev/Downloads/SHMB/documentation)**: Technical walkthroughs, logic diagrams, and algorithm guides.

## 🚀 Key Features

### 1. SmartBand Hardware
- **Medical-Grade Processing**: AGC (Auto Gain Control) and Dicrotic Notch filters for accurate PPG readings.
- **3-Stage Fall Detection**: Advanced Impact -> Settle -> Orientation validation.
- **Smooth OLED UI**: 10 FPS horizontal scrolling for live street address display.
- **Triple-Tier Location**: Seamless fallback between Satellite GPS, Mobile A-GPS, and Persistent Memory.

### 2. Mobile Dashboard App
- **Clinical Safety Engine**: Context-aware alerting (Resting/Active/Exercise) with persistence logic.
- **Reverse Geocoding**: Real-time address resolution via Nominatim API.
- **Unified Sync**: Secure BLE handshake for telemetry and high-precision calibration.

## 🛠 Getting Started

### 📱 Deploy the App
1. Navigate to the app directory: `cd shmb_app`
2. Run the deployment script: `./v3_deploy.sh`

### 🔌 Flash the Hardware
1. Navigate to the firmware directory: `cd shmb_esp32_firmware`
2. Compile and upload:
   ```bash
   arduino-cli compile --fqbn esp32:esp32:esp32c3 .
   arduino-cli upload -p <your_port> --fqbn esp32:esp32:esp32c3 .
   ```

---

## 📚 Technical Documentation
For a deep-dive into the algorithms and system logic, please refer to the following:
*   [System Overview & Architecture](file:///Users/dev/Downloads/SHMB/documentation/system_overview.md)
*   [App Software & Logic Flow](file:///Users/dev/Downloads/SHMB/documentation/app_walkthrough.md)
*   [Hardware & Sensor Algorithms](file:///Users/dev/Downloads/SHMB/documentation/hardware_walkthrough.md)

---
**Version**: 3.5.8  
**Author**: SHMB Team  
**License**: Private  
