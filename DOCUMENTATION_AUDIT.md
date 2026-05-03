# VitalSense SHMB v3.5.0 - Documentation Coverage Audit

**Date**: 2026-05-02  
**Project Version**: 3.5.8  
**Total Code**: ~1,479 lines (App + Firmware)  
**Documentation Pages**: 4 (README + 3 detailed docs)

---

## ✅ WHAT IS WELL DOCUMENTED

### System Architecture
- [system_overview.md](documentation/system_overview.md) - Excellent coverage of:
  - High-level architecture diagram (mermaid)
  - Bi-directional BLE communication protocol
  - Data handshake (500ms telemetry, 5s sync)
  - Division of responsibilities between Band and App
  - Heartbeat packet format with all fields
  - Clean conceptual model

### Hardware (Firmware)
- [hardware_walkthrough.md](documentation/hardware_walkthrough.md) - Good coverage of:
  - AGC (Auto Gain Control) algorithm logic
  - Dicrotic Notch filter explanation
  - EMA (Exponential Moving Average) smoothing
  - 3-stage fall detection (Impact → Settle → Orientation)
  - OLED display scrolling at 10 FPS
  - Power management concepts (Deep Sleep, I2C Watchdog)

### App Architecture
- [app_walkthrough.md](documentation/app_walkthrough.md) - Solid coverage of:
  - Listen-Evaluate-Act loop
  - Context-aware motion state classification (Resting/Exercise)
  - Persistence windows for alerts (HR: 120s, SpO2: 30s, Fall: 0ms)
  - Reverse geocoding pipeline (3-step process)
  - Component responsibilities (Dashboard, Map, Profile, BleManager)

### Getting Started
- [README.md](README.md) - Basic coverage of:
  - Feature highlights
  - Quick start commands
  - Directory structure
  - App deployment script reference
  - Firmware compilation command

---

## ❌ SIGNIFICANT DOCUMENTATION GAPS

### Hardware Firmware (shmb_esp32_firmware.ino - 579 lines)

#### 1. **Hardware Pin Configuration & Wiring**
**Status**: NOT DOCUMENTED  
**Impact**: Critical - Cannot build or troubleshoot hardware  
**Missing Details**:
- ESP32-C3 pin assignments (SDA_PIN=8, SCL_PIN=9, GPS_RX_PIN=20, GPS_TX_PIN=21)
- I2C bus configuration
- Sensor-to-board wiring diagram
- Serial/UART setup for GPS (BAUD 9600)
- Required pull-up resistors and capacitors
- Power distribution (VCC, GND routing)

#### 2. **Sensor Components & Libraries**
**Status**: PARTIALLY DOCUMENTED  
**Missing Details**:
- **MAX30105 PPG sensor**: Calibration procedure, LED power levels (starts 0x4F), DC threshold (40000)
- **MLX90614 IR thermometer**: Temperature offset application, ambient vs. body temp measurement
- **MPU6050 IMU**: Sensitivity settings, calibration for fall detection
- **SSD1306 OLED**: Initialization parameters, 10 FPS refresh mechanism, text rendering
- **TinyGPSPlus**: GPS parsing, NMEA message format, fallback to persistent storage
- Required Arduino libraries and versions

#### 3. **GPS & Location System**
**Status**: NOT DOCUMENTED  
**Missing Details**:
- GPS module type and configuration
- Triple-tier fallback logic:
  - Satellite GPS (raw from module)
  - Mobile A-GPS (calibration from App)
  - Persistent Memory (Preferences storage)
- How calibration is applied (calibratedLat, calibratedLng)
- Persistence mechanism (Preferences class)
- Coordinate update frequency

#### 4. **BLE GATT Service Architecture**
**Status**: PARTIALLY DOCUMENTED  
**Missing Details**:
- GATT service UUID: `12345678-1234-1234-1234-1234567890ae`
- TX characteristic (telemetry): `abcd1234-1234-1234-1234-abcdef123499`
- RX characteristic (commands): `abcd1234-1234-1234-1234-abcdef123466`
- NimBLE callback implementation (MyCallbacks class)
- Packet buffering strategy
- MTU negotiation
- Notification frequency and queueing

#### 5. **Signal Processing & Calibration**
**Status**: PARTIALLY DOCUMENTED  
**Missing Details**:
- Heart rate sample buffer (BUFFER_SIZE=100, 25 Hz sampling)
- Circular buffer management (hrHistory[5], hrHistIdx)
- Dicrotic notch detection: "exactly double the average" detection logic
- Motion freeze: lastValidHR holding mechanism
- Finger detection threshold: FINGER_THRESHOLD=40000 (revert comment indicates calibration history)
- SpO2 wrist offset: -2 dB calibration (requires external reference pulse oximeter)
- LED power AGC adjustment intervals and thresholds
- Smoothing alpha=0.08 (8% weight to new reading)

#### 6. **Fall Detection Implementation**
**Status**: DOCUMENTED CONCEPTUALLY, MISSING IMPLEMENTATION DETAILS  
**Missing Details**:
- G-force threshold: > 3.2G for impact detection
- Settle wait time: 1,500ms delay
- Pitch/Roll threshold: > 45° for "lying down" detection
- Acceleration spike detection algorithm
- State machine transitions
- False positive prevention mechanisms beyond the 3-stage model

#### 7. **Power Management**
**Status**: MENTIONED, NOT DETAILED  
**Missing Details**:
- When/how deep sleep is triggered
- IR sensor hand-detection threshold
- Sleep mode operation (does OLED turn off? GPS pause?)
- Wake-up mechanism
- Battery voltage monitoring (if any)
- Power consumption per state

#### 8. **Data Validation & Error Handling**
**Status**: NOT DOCUMENTED  
**Missing Details**:
- Temperature safety limits (MAX_SANE_TEMP=45.0°C, MIN_SANE_TEMP=20.0°C)
- How out-of-range values are handled
- Sensor failure detection
- I2C watchdog timeout mechanism
- Packet checksum or validation (if any)
- Retry logic for sensor reads

---

### Mobile App (shmb_app/src - ~900 lines)

#### 1. **Component Structure & Screen Layouts**
**Status**: NOT DOCUMENTED  
**Missing Details**:
- Dashboard screen:
  - Vital cards layout (HR, SpO2, Temp)
  - Color-coded status system (optimal/warning/critical)
  - Alert trigger UI (AlertView.tsx)
  - Connection status indicator
- Map screen:
  - Leaflet map integration
  - Marker positioning
  - Zoom/pan behavior
  - Address display on map
- Profile screen:
  - User profile form (name, age, gender)
  - Data persistence (localStorage/Capacitor Storage)
  - Profile-based threshold adjustment
  - Settings page (if any)
- Navigation structure (HashRouter vs. BrowserRouter)

#### 2. **Alert System & Thresholds**
**Status**: MENTIONED, NOT COMPREHENSIVE  
**Missing Details**:
- **alertRules.ts** content not documented:
  - Exact threshold values per state (Resting/Active/Exercise)
  - How age/gender affects thresholds
  - All alert types beyond HR/SpO2/Temp
  - Critical vs. Warning vs. Risk definitions
  - Sensitivity levels and how they're adjusted
- Alert persistence:
  - How state is maintained across reconnections
  - Local storage of alert history
  - Alert acknowledgment mechanism (if any)
- Vibration/sound patterns for different alert types

#### 3. **BLE Communication Implementation**
**Status**: PARTIALLY DOCUMENTED (BleManager.ts exists but not explained)  
**Missing Details**:
- Device scanning process:
  - Scan filters and naming
  - RSSI-based selection
  - Service discovery
- Connection flow:
  - PRE_CONNECT_DELAY_MS (350ms) and POST_CONNECT_DELAY_MS (150ms) - why these specific values
  - GATT error 133 handling on Android 9 (3 retry attempts, 12s timeout)
  - MTU negotiation
- Notification handling:
  - RxBuffer management
  - Packet parsing from "P:2.1,R:-1.5,..." format
  - Timestamp generation
  - Dropped packet handling
- Command sending (A-GPS, address):
  - Command format specification
  - Write without response vs. write with response
  - Retry mechanism
- Reconnection logic:
  - When/how reconnection is triggered
  - Backoff strategy

#### 4. **Geolocation & Map Integration**
**Status**: MENTIONED, MISSING IMPLEMENTATION  
**Missing Details**:
- Native GPS via Capacitor.Geolocation:
  - Why phone GPS is preferred over band GPS
  - Accuracy/timeout settings
  - When GPS is queried (continuous vs. on-demand)
- Nominatim API integration:
  - Endpoint URL
  - Rate limiting (if any)
  - Fallback if API is down
  - Response format and error handling
- Map rendering:
  - OpenStreetMap tile layer configuration
  - How zoom level is determined
  - How address updates trigger map pans
  - Marker icon customization

#### 5. **React Component Design**
**Status**: NOT DOCUMENTED  
**Missing Details**:
- Component hierarchy
- Props interfaces
- State management:
  - What is local vs. global state
  - How profile data is shared between screens
  - useState vs. custom hooks pattern
- useVitalSafety hook:
  - Input parameters
  - Return value structure
  - State updates (when motion classification runs)
  - Performance characteristics (frequency of re-evaluation)
- Re-render optimization (useMemo, memo())
- Dependency arrays in useEffect

#### 6. **Styling & Design System**
**Status**: PARTIALLY DOCUMENTED (Tailwind config exists)  
**Missing Details**:
- Color palette semantics:
  - What does "primary" mean vs "secondary" vs "error"
  - When to use "error-container" vs "error"
  - What are "surface-container-highest", "surface-dim" used for
- Typography scale:
  - When to use "data-lg" (40px) vs "headline-lg" vs "body-md"
  - Font weights and line-height semantics
- Spacing system:
  - What's the semantic meaning of "margin-desktop" vs "margin-mobile"
  - "gutter" (16px) vs "sm" (16px) — why both?
  - When to use "xs" (8px) vs "unit" (4px)
- Responsive design:
  - Breakpoint strategy
  - Mobile-first vs. desktop-first approach
  - SafeArea handling for notches

#### 7. **Development & Build Process**
**Status**: MENTIONED (v3_deploy.sh), NOT FULLY DOCUMENTED  
**Missing Details**:
- Development workflow:
  - `npm run dev` - what port, reload behavior
  - TypeScript compilation with tsc
  - Vite hot module replacement (HMR) configuration
- Build process:
  - Vite bundle optimization
  - Asset handling (images, icons)
  - Source map generation
  - Environment variables (dev vs. prod)
- Capacitor integration:
  - `cap sync` vs `cap copy` vs `cap update`
  - What files are synced
  - Android platform-specific changes
- Android build:
  - Gradle configuration
  - Java version requirement (17)
  - APK signing (debug vs. release)
  - AAB generation for Play Store
- App signing and distribution

#### 8. **Android Permissions & Capabilities**
**Status**: MENTIONED IN METADATA, NOT DETAILED  
**Missing Details**:
- Bluetooth permissions:
  - BLUETOOTH, BLUETOOTH_ADMIN, BLUETOOTH_SCAN, BLUETOOTH_CONNECT
  - Runtime permission requests (Android 12+)
- Location permissions:
  - FINE_LOCATION, COARSE_LOCATION
  - When permissions are requested
  - Graceful degradation without permissions
- Other permissions:
  - Vibration (VIBRATE)
  - Network access (for Nominatim)
  - Storage (if any)
- AndroidManifest.xml modifications needed
- Troubleshooting permission denials

#### 9. **Local State & Data Persistence**
**Status**: NOT DOCUMENTED  
**Missing Details**:
- What data is persisted (profile, history, cache)
- Storage mechanism (localStorage vs. Capacitor Storage vs. SQLite)
- Data schema
- Migration strategy
- Cache invalidation

#### 10. **Error Handling & Offline Behavior**
**Status**: PARTIALLY CODED, NOT DOCUMENTED  
**Missing Details**:
- Connection loss handling:
  - UI state (grayed out, "Offline" message)
  - Automatic reconnection attempts
  - User notifications
- Sensor disconnection:
  - When to show "No Signal" vs "Offline"
  - Display of last-known values
- API failures:
  - Nominatim API downtime
  - GPS unavailable
  - Network timeouts
- Graceful degradation (operate without features)

#### 11. **Testing**
**Status**: NOT MENTIONED  
**Missing Details**:
- Unit tests
- Integration tests
- E2E tests
- Test coverage
- Mocking strategy for BLE

---

### DevOps & Deployment

#### 1. **Hardware Flashing Procedure**
**Status**: MENTIONED BRIEFLY, NOT COMPREHENSIVE  
**Missing Details**:
- Required tools:
  - Arduino IDE or arduino-cli version
  - ESP32 board package installation
  - USB driver for ESP32-C3
- Step-by-step flashing:
  - Detecting the COM port
  - Setting correct board/partition settings
  - Baud rate for upload
  - Troubleshooting connection issues
- Factory reset procedure (if needed)
- Firmware validation (how to confirm it's running)

#### 2. **App Deployment Pipeline**
**Status**: DOCUMENTED AS SCRIPT, NOT AS GUIDE  
**Missing Details**:
- Prerequisites:
  - Node.js version
  - Java 17 location and setup
  - Android SDK version
  - gradle version
  - Capacitor version compatibility
- Debugging the deploy script:
  - What each command does
  - Common failures and fixes (GATT error 133, gradle issues, ADB not found)
- Release build process (APK/AAB signing)
- Install to physical device vs. emulator
- Uninstalling old app version cleanly
- Testing after install

#### 3. **BLE Device Pairing & First Connection**
**Status**: NOT DOCUMENTED  
**Missing Details**:
- Device discovery (how to find the band on the phone)
- Bluetooth pairing vs. GATT connection (difference)
- Service UUID confirmation
- First-time handshake
- Connection timeout behavior
- Re-pairing procedure
- Multiple device handling

#### 4. **Configuration Management**
**Status**: NOT DOCUMENTED  
**Missing Details**:
- Environment variables:
  - API endpoints (Nominatim URL)
  - Feature flags
  - Debug logging levels
- Device-specific configuration:
  - Bluetooth UUIDs (hardcoded in BleManager, should be configurable)
  - Sensor thresholds
  - Calibration values
- Configuration files (if any)
- Secret management (API keys, if any)

#### 5. **Monitoring & Debugging**
**Status**: NOT DOCUMENTED  
**Missing Details**:
- Log levels and output:
  - Console logging strategy
  - Local file logging
  - Remote logging (if any)
- Debugging tools:
  - React DevTools setup
  - Chrome DevTools for web
  - Android Studio debugger
  - BLE Sniffer (for packet inspection)
- Data logging:
  - Exporting sensor data
  - CSV/JSON format
  - Timestamps and correlation
- Performance monitoring:
  - Frame rate (FPS) tracking
  - BLE latency measurement
  - Memory usage

---

## 📊 COVERAGE SUMMARY

| Aspect | Coverage | Priority |
|--------|----------|----------|
| **Architecture** | ✅ 95% | - |
| **Hardware Concepts** | ✅ 70% | High |
| **Hardware Implementation** | ❌ 20% | **CRITICAL** |
| **App Architecture** | ✅ 75% | Medium |
| **App Components** | ❌ 30% | **CRITICAL** |
| **Deployment** | ⚠️ 40% | **HIGH** |
| **Configuration** | ❌ 5% | **HIGH** |
| **Debugging** | ❌ 0% | Medium |
| **Testing** | ❌ 0% | Medium |

---

## 🚨 CRITICAL GAPS (Must Document)

1. **Hardware pin mapping & wiring diagram** - Cannot build without this
2. **Sensor calibration procedures** - Cannot get accurate readings without this
3. **BLE GATT service details** - Cannot troubleshoot connectivity without this
4. **GPS fallback logic** - Cannot understand location tracking without this
5. **App component structure** - Cannot maintain/extend app without this
6. **Alert thresholds** - Cannot understand safety logic without this
7. **Deployment prerequisites** - Cannot set up development environment without this
8. **Android permissions** - Cannot get app to run without this

---

## 📋 RECOMMENDED DOCUMENTATION ADDITIONS

### New Documents to Create

1. **`documentation/hardware_components.md`** (150-200 lines)
   - Schematic/wiring diagram
   - Pin assignments with explanation
   - Component datasheets links
   - I2C address mapping
   - GPS module details

2. **`documentation/calibration_guide.md`** (100-150 lines)
   - Sensor calibration procedures
   - AGC tuning
   - SpO2 offset calibration (need reference oximeter)
   - Temperature offset adjustment
   - Pitch/Roll orientation alignment

3. **`documentation/ble_protocol.md`** (100-150 lines)
   - GATT service/characteristic UUIDs
   - Packet format specification
   - Message types and fields
   - NimBLE callback architecture
   - Connection state machine

4. **`documentation/app_setup_guide.md`** (150-200 lines)
   - Environment setup (Node.js, Java, Android SDK)
   - Dependency installation
   - Dev workflow (npm run dev)
   - Common troubleshooting

5. **`documentation/app_components.md`** (150-200 lines)
   - Component hierarchy diagram
   - Props interfaces
   - State management patterns
   - Screen-by-screen breakdown

6. **`documentation/alert_thresholds.md`** (100-150 lines)
   - Alert rule definitions
   - Threshold values per state
   - Age/gender adjustment logic
   - Persistence window details

7. **`documentation/deployment_guide.md`** (200-250 lines)
   - Hardware flashing (step-by-step)
   - App building (step-by-step)
   - APK installation
   - First-time setup (pairing, profile creation)
   - Troubleshooting common issues

8. **`documentation/configuration_reference.md`** (100-150 lines)
   - All hardcoded constants
   - Environment variables
   - Sensor thresholds
   - BLE UUIDs and packet format constants

9. **`documentation/debugging_guide.md`** (100-150 lines)
   - Logging setup
   - DevTools/debugger configuration
   - BLE debugging tools
   - Common error messages and solutions

10. **`documentation/api_reference.md`** (150-200 lines)
    - BleManager class public interface
    - useVitalSafety hook API
    - SensorData interface
    - AlertLevel enum

---

## 🎯 QUICK WINS (Easy Wins to Close Gaps)

- [ ] Add wiring diagram (Fritzing/ASCII)
- [ ] Create constants reference table
- [ ] Document alertRules.ts thresholds
- [ ] List all Arduino libraries with versions
- [ ] Explain v3_deploy.sh script line-by-line
- [ ] Create checklist for first-time setup
- [ ] Add troubleshooting FAQ section
- [ ] List all Bluetooth UUIDs in one place

---

## 📝 EXISTING DOCUMENTATION ASSESSMENT

| Document | Quality | Completeness | Actionability |
|----------|---------|--------------|--------------|
| README.md | Good | 60% | Medium |
| system_overview.md | Excellent | 85% | High |
| hardware_walkthrough.md | Good | 65% | Medium |
| app_walkthrough.md | Good | 70% | Medium |
| **Overall** | **Good** | **70%** | **Medium** |

---

## 💡 FINAL RECOMMENDATION

The existing documentation provides **excellent conceptual understanding** of the system architecture and algorithms. However, it lacks **implementation details** needed for:
- Setting up the development environment
- Building and deploying hardware
- Extending or troubleshooting the application
- Understanding error conditions and edge cases

**Priority**: Create 5-7 focused documents covering critical gaps, especially:
1. Hardware setup & calibration
2. App component structure
3. Deployment procedures
4. Configuration reference
5. Debugging guide

This would take **~20-30 hours** of writing and should reach **~90%+ coverage** of the project.
