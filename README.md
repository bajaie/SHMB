# VitalSense SHMB v3.5.0: Advanced Biometric & Location Platform

VitalSense is a high-precision wearable IoT system designed for critical health monitoring and real-time location tracking. This repository contains the final, streamlined production code for both the mobile application and the ESP32-C3 firmware.

## 📂 Repository Structure

- **[shmb_app/](file:///Users/dev/Downloads/SHMB/shmb_app)**: The final Mobile Dashboard application (React + Capacitor + Vite).
- **[shmb_hardware/](file:///Users/dev/Downloads/SHMB/shmb_hardware)**: The professional-grade ESP32-C3 firmware.

## 🚀 Key Features (v3.5.0)

### 1. SmartBand Firmware
- **Medical-Grade Processing**: AGC (Auto Gain Control) and Dicrotic Notch filters for accurate PPG readings from the wrist.
- **3-Stage Fall Detection**: Advanced Impact -> Settle -> Orientation validation to prevent false positives.
- **Scrolling OLED UI**: High-refresh (10 FPS) horizontal scrolling for live street address display.
- **Triple-Tier Location**: Seamless fallback between Satellite GPS, Mobile A-GPS, and Persistent Memory.

### 2. Mobile Dashboard App
- **Reverse Geocoding**: Real-time address resolution via Nominatim API.
- **Clinical Safety Engine**: State-aware alerting (Resting/Active/Exercise) with threshold persistence.
- **Unified Sync**: Secure BLE handshake for telemetry and high-precision calibration.

## 🛠 Getting Started

### 📱 Deploy the App
1. Navigate to the app directory: `cd shmb_app`
2. Run the deployment script: `./v3_deploy.sh`

### 🔌 Flash the Firmware
1. Navigate to the firmware directory: `cd shmb_hardware`
2. Compile and upload:
   ```bash
   arduino-cli compile --fqbn esp32:esp32:esp32c3 .
   arduino-cli upload -p <your_port> --fqbn esp32:esp32:esp32c3 .
   ```

---
**Version**: 3.5.8  
**Architecture**: [Logic & Algorithms Guide](file:///Users/dev/.gemini/antigravity/brain/ac2f4d78-fd7e-437a-952a-dd4f86baef94/artifacts/architecture_and_logic.md)  
**Author**: bajaie / Antigravity  
