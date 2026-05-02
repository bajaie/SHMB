# SHMB Hardware: Firmware Architecture & Sensor Logic

The SHMB SmartBand is powered by an **ESP32-C3** MCU running an optimized Arduino-based firmware. It is designed for low-power, high-accuracy biometric sampling.

---

## 1. Biometric Algorithms (The Core)

### A. AGC (Auto Gain Control)
*   **Job**: Ensuring accurate pulse readings regardless of skin tone.
*   **Logic**: The MAX30105 sensor monitors the "DC Level" of reflected light. If the signal is too weak, the firmware automatically increases the LED power in 15mA steps until a clean pulse waveform is detected.

### B. Dicrotic Notch Harmonic Filter
*   **Job**: Preventing Heart Rate Doubling.
*   **Logic**: Wrist pulses often have a "double peak." The firmware compares each reading to the 30-second average. If a reading is exactly double the average, it identifies the dicrotic notch and "halves" the result to keep it medically accurate.

### C. EMA (Exponential Moving Average)
*   **Job**: Smoothing noise from arm movement.
*   **Logic**: We use an Alpha filter (0.08). This gives 8% weight to the new reading and 92% weight to the history, eliminating jerky jumps in the UI.

---

## 2. Fall Detection Logic (3-Stage Validation)

1.  **Stage 1: Impact (Hardware)**
    *   The MPU6050 detects a sudden spike in G-force (> 3.2G).
2.  **Stage 2: Settling (Time)**
    *   The system waits 1,500ms to allow the user to move.
3.  **Stage 3: Orientation (Angle)**
    *   If movement is low AND the Pitch/Roll angle is > 45° (lying down), a **`FALL:1`** flag is sent to the phone.

---

## 3. UI & Display Management

### 10 FPS Smooth Scroll
*   The OLED display runs on a decoupled 100ms timer.
*   The location address string moves 4 pixels per frame.
*   This ensures that even long addresses (e.g., "Park Road, Sector F-6, Islamabad") are perfectly readable while walking.

---

## 4. Power & Safety Features
*   **I2C Watchdog**: Ensures that a hung sensor (like a GPS timeout) doesn't freeze the whole band.
*   **Deep Sleep Ready**: The firmware is designed to enter a low-power mode when no "Hand" is detected by the IR sensor.

---
**Reference**: [System Overview](file:///Users/dev/Downloads/SHMB/documentation/system_overview.md)
