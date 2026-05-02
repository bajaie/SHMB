# SHMB App: Software Architecture & Logical Flow

The SHMB Mobile App is a cross-platform application built with **React**, **Capacitor**, and **Vite**. It acts as the "Clinical Brain" of the system.

---

## 1. Internal Logic Flow

The App operates on a "Listen-Evaluate-Act" loop:

1.  **Listen**: `BleManager.ts` captures incoming notifications from the Band and parses them into a standard `SensorData` object.
2.  **Evaluate**: The `useVitalSafety.ts` hook receives this data and passes it through the **Safety Engine**.
3.  **Act**: If thresholds are exceeded, the UI triggers the `AlertView.tsx` and vibrates the phone.

---

## 2. The Safety Engine (Logic & Algorithms)

The app doesn't just check for "High" or "Low" numbers. It uses **Context-Aware Logic**:

### A. Motion State Classification
The app calculates the variance in the Band's Pitch and Roll over a 30-second window:
*   **Resting**: High sensitivity. Any deviation triggers a warning.
*   **Exercise**: Low sensitivity. The app expects a high heart rate and suppresses false alarms.

### B. Persistence Windows
To prevent "alarm fatigue" from sensor glitches:
*   **Heart Rate Risk**: Must stay abnormal for **120 seconds** before an alert triggers.
*   **SpO2 Risk**: Must stay below 90% for **30 seconds** before an alert triggers.
*   **Critical Fall**: Triggers **instantly** (0ms delay) based on the Band's hardware interrupt.

---

## 3. The Location Engine

The App implements a high-precision **Reverse Geocoding Pipeline**:

1.  **Coordinate Acquisition**: The app attempts to use the phone's native GPS first (more accurate than a wrist GPS).
2.  **API Resolution**: Coordinates are sent to the **Nominatim (OpenStreetMap) API**.
3.  **Display**: The human-readable string is shown on the App Map and sent to the Band's OLED.

---

## 4. Component Structure

| Component | Responsibility |
| :--- | :--- |
| **Dashboard** | Visualizes HR, SpO2, and Temp with color-coded interpretations. |
| **Map** | Leaflet-based tracking showing the user's live position and address. |
| **Profile** | Manages user metadata (Age, Gender) used to calibrate alert thresholds. |
| **BleManager** | Handles the GATT handshake, reconnections, and packet buffering. |

---
**Reference**: [System Overview](file:///Users/dev/Downloads/SHMB/documentation/system_overview.md)
