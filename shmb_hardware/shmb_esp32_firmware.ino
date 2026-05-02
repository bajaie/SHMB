#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <MPU6050_light.h>
#include <Adafruit_MLX90614.h>
#include <MAX30105.h>
#include <spo2_algorithm.h>
#include <NimBLEDevice.h>
#include <HardwareSerial.h>
#include <TinyGPSPlus.h>
#include <Preferences.h>

Preferences preferences;
float savedLat = 0, savedLng = 0;

/** 
 * SHMB SmartBand Firmware v3.5.0 (Precision Edition)
 * Optimized for ESP32-C3-MINI
 * Safety Compliance: Low-power IR, I2C Watchdog, LPF Signal Filtering
 */

// ---------------- HARDWARE CONFIG ----------------
#define SDA_PIN 8
#define SCL_PIN 9
#define GPS_RX_PIN 20
#define GPS_TX_PIN 21
#define GPS_BAUD 9600

// ---------------- SAFETY CONSTANTS ----------------
#define FIRMWARE_VERSION    "3.5.0"
// Calibrated UUIDs from App
#define SERVICE_UUID           "12345678-1234-1234-1234-1234567890ae"
#define CHARACTERISTIC_UUID    "abcd1234-1234-1234-1234-abcdef123466"
#define CHARACTERISTIC_RX_UUID "abcd1234-1234-1234-1234-abcdef123499"
#define BUFFER_SIZE         100
#define FINGER_THRESHOLD    40000  // revert: 60k was too high for wrist IR at starting LED power
#define MAX_SANE_TEMP       45.0f  // Medical safety limit
#define MIN_SANE_TEMP       20.0f
// Wrist-to-fingertip SpO2 offset — calibrate against a reference pulse oximeter and adjust
#define SPO2_WRIST_OFFSET   (-2)

// ---------------- SENSOR OBJECTS ----------------
Adafruit_SSD1306 display(128, 64, &Wire, -1);
MPU6050 mpu(Wire);
Adafruit_MLX90614 mlx;
MAX30105 particleSensor;
HardwareSerial gpsSerial(1);
TinyGPSPlus gps;
NimBLECharacteristic* pCharacteristic = NULL;
NimBLECharacteristic* pRxCharacteristic = NULL;

// ---------------- STATE ----------------
uint32_t irBuffer[BUFFER_SIZE];
uint32_t redBuffer[BUFFER_SIZE];
int32_t spo2 = 0, heartRate = 0;
int8_t validSPO2 = 0, validHeartRate = 0;
float bodyTemp = 36.6, ambientTemp = 24.0;
bool fingerDetected = false;
float pitch = 0, roll = 0;
float smoothedHR = 0;
// FreqS=25 is hardcoded in spo2_algorithm.h; keep alpha conservative
const float HR_FILTER_ALPHA = 0.08;

// LED power — AGC adjusts this dynamically
uint8_t ledPower = 0x4F;          // ≈15 mA starting point; AGC reduces if DC saturates
unsigned long lastAgcMs = 0;
uint32_t dcLevel = 0;             // latest IR DC level — shown on OLED for debug

// Circular-buffer state
static int32_t  hrSampleCount   = 0;
static int32_t  hrHistory[5]    = {0, 0, 0, 0, 0};
static int      hrHistIdx       = 0;
static uint8_t  hrHistSize      = 0;
static bool     prevFingerState = false;  // detects finger-placement transition

// Motion-freeze state — holds last good HR reading while arm is moving
static float         lastValidHR  = 0;
static unsigned long lastValidHRMs = 0;

bool fallDetected = false;
unsigned long fallTime = 0;
bool phoneActive = false;

// Fall Detection States
float lastStablePitch = 0, lastStableRoll = 0;
bool potentialFall = false;
unsigned long impactTime = 0;
float maxImpactG = 0;

// Assisted GPS Storage
float calibratedLat = 0;
float calibratedLng = 0;
bool hasCalibration = false;
String locationAddr = "Searching...";
int scrollPos = 128;
unsigned long lastScrollMs = 0;

class MyCallbacks : public NimBLECharacteristicCallbacks {
public:
    void onWrite(NimBLECharacteristic* pCharacteristic, NimBLEConnInfo& connInfo) override {
        std::string value = pCharacteristic->getValue();
        if (value.length() > 0) {
            String msg = "";
            for(int i=0; i<value.length(); i++) msg += (char)value[i];
            
            msg.trim();
            
            Serial.print(">>> BLE RECEIVED: ");
            Serial.println(msg);

            // Simple prefix-based check. App now sends Location and GPS separately.
            if (msg.startsWith("A:")) {
                locationAddr = msg.substring(2);
                scrollPos = 128; // Reset scroll
                Serial.println(">>> ACK: ADDR=" + locationAddr);
            } 
            else if (msg.startsWith("L:")) {
                int commaIdx = msg.indexOf(",");
                if (commaIdx != -1) {
                    calibratedLat = msg.substring(2, commaIdx).toFloat();
                    int gIdx = msg.indexOf("G:", commaIdx);
                    if (gIdx != -1) {
                        calibratedLng = msg.substring(gIdx + 2).toFloat();
                        hasCalibration = true;
                        Serial.println(">>> ACK: CALIBRATION APPLIED");
                    }
                }
            }
        }
    }
};

class MyServerCallbacks: public NimBLEServerCallbacks {
    void onConnect(NimBLEServer* pServer) {
        Serial.println("PHONE CONNECTED");
        phoneActive = true;
    }
    void onDisconnect(NimBLEServer* pServer) {
        pServer->getAdvertising()->start();
        Serial.println("Re-advertising started...");
        phoneActive = false;
    }
};

void setupBLE() {
  NimBLEDevice::init("SHMB");
  NimBLEDevice::setPower(9); 
  
  NimBLEServer* pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  
  NimBLEService* pService = pServer->createService(SERVICE_UUID);
  
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY
                    );
                    
  pRxCharacteristic = pService->createCharacteristic(
                        CHARACTERISTIC_RX_UUID,
                        NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
                      );
  pRxCharacteristic->setCallbacks(new MyCallbacks());

  pService->start();
  
  NimBLEAdvertising* pAdv = NimBLEDevice::getAdvertising();
  pAdv->setName("SHMB");
  pAdv->addServiceUUID(SERVICE_UUID);
  pAdv->start();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println(">>> BOOT: SHMB v" FIRMWARE_VERSION " Starting...");
  Serial.println(">>> BOOT: SERIAL OK");
  
  // 1. START BLUETOOTH IMMEDIATELY (So it's visible while sensors warm up)
  setupBLE();
  Serial.println(">>> BOOT: BLE OK");

  // 2. I2C Initialization
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000); 
  Wire.setTimeOut(50); 
  Serial.println(">>> BOOT: I2C OK");
  
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println(">>> BOOT: GPS UART OK");

  // Load Last Known Location from Flash
  preferences.begin("shmb", false);
  savedLat = preferences.getFloat("lat", 0.0);
  savedLng = preferences.getFloat("lng", 0.0);
  calibratedLat = savedLat;
  calibratedLng = savedLng;
  Serial.println(">>> BOOT: LAST KNOWN POS: " + String(savedLat, 6) + "," + String(savedLng, 6));

  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(">>> BOOT: OLED FAIL");
  } else {
    Serial.println(">>> BOOT: OLED OK");
  }
  
  mlx.begin();
  Serial.println(">>> BOOT: MLX TEMP OK");
  
  // Motion Sensor (Non-blocking attempt)
  byte mpuStatus = mpu.begin();
  if(mpuStatus == 0) {
    Serial.println(">>> BOOT: MPU6050 STARTING...");
    mpu.calcOffsets(); // This can take a few seconds
    Serial.println(">>> BOOT: MPU6050 OK");
  } else {
    Serial.println(">>> BOOT: MPU6050 FAIL");
  }

  // 3. MAX30102 Setup
  Serial.println(">>> BOOT: STARTING MAX30102...");
  memset(irBuffer,  0, sizeof(irBuffer));
  memset(redBuffer, 0, sizeof(redBuffer));

  if (particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {
    // LED 0x4F (79/255): wrist needs more IR power than fingertip to get a clean signal.
    // sampleRate 100 Hz / sampleAverage 4 = 25 Hz effective rate, which matches the
    // FreqS=25 constant hardcoded in spo2_algorithm.h. At 400 Hz the algorithm saw
    // noise peaks spaced ~10 samples apart and calculated (25*60)/10 = 150 BPM.
    particleSensor.setup(ledPower, 4, 2, 100, 411, 4096);
    Serial.println(">>> BOOT: MAX30102 OK");
  } else {
    Serial.println(">>> BOOT: MAX30102 FAIL");
  }

  Serial.println(">>> SYSTEM READY <<<");
}

void loop() {
  unsigned long now = millis();

  // 1. BLE INBOX POLLING (Direct bypass for calibration issues)
  if (pRxCharacteristic) {
    std::string rxValue = pRxCharacteristic->getValue();
    if (rxValue.length() > 0) {
      String msg = String(rxValue.c_str());
      static String lastMsg = "";
      
      if (msg != lastMsg && msg.indexOf("L:") != -1) {
        lastMsg = msg;
        Serial.print(">>> INBOX RECEIVED: ");
        Serial.println(msg);
        
        int latIdx = msg.indexOf("L:");
        int lngIdx = msg.indexOf("G:");
        int commaIdx = msg.indexOf(",", latIdx);
        
        if (latIdx != -1 && lngIdx != -1) {
          calibratedLat = msg.substring(latIdx + 2, commaIdx).toFloat();
          calibratedLng = msg.substring(lngIdx + 2).toFloat();
          hasCalibration = true;
          Serial.println(">>> ACK: CALIBRATION SYNCED");
          
          // Visual Confirmation on OLED
          display.clearDisplay();
          display.setCursor(0,0);
          display.println("CALIB RECEIVED!");
          display.display();
          delay(500);
        }
      }
    }
  }

  // 2. GPS HANDLER
  while (gpsSerial.available() > 0) gps.encode(gpsSerial.read());

  // 2. MOTION SAFETY (Non-blocking)
  mpu.update();
  pitch = mpu.getAngleX();
  roll = mpu.getAngleY();
  float ax = mpu.getAccX(), ay = mpu.getAccY(), az = mpu.getAccZ();
  float accelMag = sqrt(ax*ax + ay*ay + az*az);
  
  // Advanced Fall Detection Algorithm (V3.2)
  if (accelMag > 3.2) { // 1. Impact Detected
    if (!potentialFall) {
      potentialFall = true;
      impactTime = now;
      maxImpactG = accelMag;
    }
  }

  if (potentialFall) {
    // 2. Post-Impact Inactivity/Orientation Check
    if (now - impactTime > 1500) { // Wait 1.5s for the dust to settle
      float currentAccelMag = sqrt(mpu.getAccX()*mpu.getAccX() + mpu.getAccY()*mpu.getAccY() + mpu.getAccZ()*mpu.getAccZ());
      
      // If still lying down (pitch/roll > 45deg) and low movement (< 1.2g)
      if (currentAccelMag < 1.3 && (abs(pitch) > 45 || abs(roll) > 45)) {
        fallDetected = true;
        fallTime = now;
      }
      potentialFall = false; // Reset search
    }
  }

  if (fallDetected && (abs(pitch) < 20 && abs(roll) < 20)) {
    // User stood back up - Auto Dismiss
    fallDetected = false;
  }
  
  if (fallDetected && now - fallTime > 30000) fallDetected = false; // Safety timeout

  // 3. BIOMETRIC CORE
  long irValue = particleSensor.getIR();
  if (irValue > FINGER_THRESHOLD) {
    fingerDetected = true;

    // On first contact (finger just placed), pre-fill the buffer with the current
    // DC reading instead of zeros. A zero-padded buffer distorts the mean threshold
    // inside the algorithm, preventing peak detection for the first 4 seconds.
    if (!prevFingerState) {
      particleSensor.check();
      uint32_t initIR  = particleSensor.getIR();
      uint32_t initRed = particleSensor.getRed();
      for (int fi = 0; fi < BUFFER_SIZE; fi++) {
        irBuffer[fi]  = initIR;
        redBuffer[fi] = initRed;
      }
      hrSampleCount = 0;
    }
    prevFingerState = true;

    // Drain the sensor FIFO into the circular buffer one sample at a time.
    particleSensor.check();
    while (particleSensor.available()) {
      memmove(irBuffer,  irBuffer  + 1, (BUFFER_SIZE - 1) * sizeof(uint32_t));
      memmove(redBuffer, redBuffer + 1, (BUFFER_SIZE - 1) * sizeof(uint32_t));
      irBuffer[BUFFER_SIZE - 1]  = particleSensor.getIR();
      redBuffer[BUFFER_SIZE - 1] = particleSensor.getRed();
      particleSensor.nextSample();
      hrSampleCount++;
    }

    // AGC: check every 2 s, target DC 100k–200k.
    // Higher target than before so weak wrist signals still produce a clear AC waveform.
    dcLevel = irBuffer[BUFFER_SIZE - 1];
    if (now - lastAgcMs > 2000) {
      lastAgcMs = now;
      if (dcLevel > 200000 && ledPower > 0x08) {
        ledPower -= 0x08;
        particleSensor.setPulseAmplitudeRed(ledPower);
        particleSensor.setPulseAmplitudeIR(ledPower);
        Serial.printf(">>> AGC: LED 0x%02X DC=%lu (reduced)\n", ledPower, dcLevel);
      } else if (dcLevel < 100000 && ledPower < 0x7F) {
        ledPower += 0x08;
        particleSensor.setPulseAmplitudeRed(ledPower);
        particleSensor.setPulseAmplitudeIR(ledPower);
        Serial.printf(">>> AGC: LED 0x%02X DC=%lu (raised)\n", ledPower, dcLevel);
      }
    }

    // Run algorithm every 25 new samples (once per second at 25 Hz effective rate).
    if (hrSampleCount >= 25) {
      hrSampleCount = 0;
      maxim_heart_rate_and_oxygen_saturation(irBuffer, BUFFER_SIZE, redBuffer,
                                             &spo2, &validSPO2, &heartRate, &validHeartRate);

      // Apply wrist-specific SpO2 offset (calibrate SPO2_WRIST_OFFSET against a
      // reference pulse oximeter; default -2 is a conservative starting estimate).
      if (validSPO2 && spo2 > 0) {
        spo2 = constrain(spo2 + SPO2_WRIST_OFFSET, 0, 100);
      }

      // Dicrotic notch harmonic correction.
      // Wrist PPG has a prominent secondary bump (dicrotic notch) ~320 ms after the
      // systolic peak. The algorithm counts both bumps as separate heartbeats, doubling
      // the reported BPM. If the raw result is in the 2x range AND halving it lands
      // closer to the established baseline (or there is no baseline yet), use the half.
      if (validHeartRate && heartRate > 110 && heartRate <= 220) {
        int32_t halved = heartRate / 2;
        if (halved >= 45 && halved <= 110) {
          bool noBaseline  = (smoothedHR < 10);
          bool halfCloser  = (abs(halved - (int32_t)smoothedHR) <
                              abs(heartRate - (int32_t)smoothedHR));
          if (noBaseline || halfCloser) {
            heartRate = halved;
          }
        }
      }

      // Motion is NEVER a blocker — the algorithm always runs.
      // accelMag is only used to reject samples that are clearly motion artifacts:
      // a sudden high reading while the wrist is being moved fast.
      // The EMA (alpha=0.08) self-corrects a few bad samples automatically.
      if (validHeartRate && heartRate >= 45 && heartRate <= 150) {
        // Consistency gate: reject if far from the median of last 5 readings
        hrHistory[hrHistIdx % 5] = heartRate;
        hrHistIdx++;
        if (hrHistSize < 5) hrHistSize++;

        int32_t sorted[5];
        memcpy(sorted, hrHistory, sizeof(hrHistory));
        for (int i = 1; i < 5; i++) {
          int32_t key = sorted[i]; int j = i - 1;
          while (j >= 0 && sorted[j] > key) { sorted[j+1] = sorted[j]; j--; }
          sorted[j+1] = key;
        }
        int32_t medianHR = sorted[2];
        bool consistent  = (hrHistSize < 3) ||
                           (medianHR > 0 && abs(heartRate - medianHR) <= 15);

        // Motion spike: only discard if the reading is >50% above baseline
        // AND the wrist is clearly moving (accelMag > 1.8g).
        // Normal walking/mild motion (1.0–1.5g) is allowed through.
        bool isMotionSpike = (accelMag > 1.8f &&
                              smoothedHR > 0 &&
                              heartRate > (int32_t)(smoothedHR * 1.5f));

        if (consistent && !isMotionSpike) {
          if (smoothedHR < 10) smoothedHR = heartRate;
          else smoothedHR = (heartRate * HR_FILTER_ALPHA) +
                            (smoothedHR * (1.0f - HR_FILTER_ALPHA));
          lastValidHR   = smoothedHR;
          lastValidHRMs = now;
        }
      }
    }
  } else {
    // No finger — log raw DC so user can characterise optical crosstalk on their board
    static unsigned long lastCrosstalkLog = 0;
    if (now - lastCrosstalkLog > 3000) {
      lastCrosstalkLog = now;
      Serial.printf(">>> NO FINGER: DC=%lu (crosstalk floor)\n", (unsigned long)particleSensor.getIR());
    }
    fingerDetected  = false;
    prevFingerState = false;
    smoothedHR      = 0;
    spo2            = 0;
    hrSampleCount   = 0;
    hrHistIdx       = 0;
    hrHistSize      = 0;
    lastValidHR     = 0;
    lastValidHRMs   = 0;
    dcLevel         = 0;
    memset(hrHistory, 0, sizeof(hrHistory));
  }

  // 4. TEMPERATURE (Medical Sanity Checks)
  float rawObj = mlx.readObjectTempC();
  if (rawObj > MIN_SANE_TEMP && rawObj < MAX_SANE_TEMP) {
    bodyTemp = rawObj + 1.8; // Wrist Skin to Core Calibration
  }
  ambientTemp = mlx.readAmbientTempC();

  // --- START OF HYBRID FLOWCHART LOGIC ---
  float outLat = 0.0, outLng = 0.0;
  String statusMsg = "";
  int gpsFixTier = 0;

  // 1. Check for valid Satellite Fix
  if (gps.location.isValid()) {
    outLat = gps.location.lat();
    outLng = gps.location.lng();
    gpsFixTier = 1;
  } else if (phoneActive && hasCalibration) {
    // MOBILE ASSIST PRIORITY (Only if connected)
    outLat = calibratedLat;
    outLng = calibratedLng;
    gpsFixTier = 2;
  } else {
    // FALLBACK TO MEMORY
    outLat = savedLat;
    outLng = savedLng;
    gpsFixTier = 3;
  }

  // 5. STATUS BEACON (Every 2 seconds)
  static unsigned long lastBeacon = 0;
  if (now - lastBeacon > 2000) {
    lastBeacon = now;
    Serial.print(">>> STATUS: ");
    if (gpsFixTier == 1) Serial.print("FIX:SATELLITE");
    else if (gpsFixTier == 2) Serial.print("FIX:MOBILE");
    else Serial.print("FIX:MEMORY");
    
    Serial.print(" | BLE: ");
    Serial.println(phoneActive ? "CONNECTED" : "ADVERTISING...");
  }

  // SAVE logic (Per flowchart: if GPS or Mobile location is used, save it)
  static unsigned long lastSaveTime = 0;
  if (gpsFixTier < 3 && outLat != 0 && (now - lastSaveTime > 30000)) {
    lastSaveTime = now;
    preferences.putFloat("lat", outLat);
    preferences.putFloat("lng", outLng);
    savedLat = outLat;
    savedLng = outLng;
    Serial.println(">>> MEMORY: LOCATION UPDATED");
  }

  // 5. BLE BROADCAST (Update app with current tier data)
  String payload = "P:" + String(pitch,1) + 
                   ",R:" + String(roll,1) + 
                   ",TO:" + String(bodyTemp,1) + 
                   ",TA:" + String(ambientTemp,1) + 
                   ",HR:" + String((int)smoothedHR) + 
                   ",SPO2:" + String(validSPO2 ? spo2 : 0) + 
                   ",FALL:" + String(fallDetected ? 1 : 0) + 
                   ",LAT:" + String(outLat, 6) + 
                   ",LNG:" + String(outLng, 6) + 
                   ",FIX:" + String(gpsFixTier) + 
                   ",HAND:" + String(fingerDetected ? 1 : 0) +
                   ",G:" + String(maxImpactG, 1) +
                   ",V:" + FIRMWARE_VERSION;

  if(pCharacteristic) { 
    pCharacteristic->setValue(payload.c_str());
    pCharacteristic->notify();
  }

  // 6. OLED REFRESH — throttled to 100 ms for smooth scrolling
  static unsigned long lastOledMs = 0;
  if (now - lastOledMs >= 100) {
    lastOledMs = now;
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);

    display.setTextSize(1);

    // Row 1: HR | SpO2
    display.setCursor(0, 0);
    display.print("HR: ");
    if (smoothedHR > 0) display.print((int)smoothedHR);
    else display.print("--");
    
    display.setCursor(64, 0);
    display.print("| SPO2: ");
    display.print(validSPO2 ? spo2 : 0);
    display.print("%");

    // Row 2: Body Temp | Env Temp
    display.setCursor(0, 12);
    display.print("BT: ");
    display.print(bodyTemp, 1);
    display.print("C");

    display.setCursor(64, 12);
    display.print("| ET: ");
    display.print(ambientTemp, 1);
    display.print("C");

    // Divider
    display.setCursor(0, 24);
    display.println("---------------------");

    // Row 3: Hand Detection
    display.setCursor(0, 36);
    display.print("Hand: ");
    display.print(fingerDetected ? "YES" : "NO");

    // Divider for Location
    display.drawLine(0, 48, 128, 48, SSD1306_WHITE);

    // Row 4: Scrolling Address
    display.setCursor(scrollPos, 54);
    display.print(locationAddr);
    
    // Move 4 pixels per frame (10 FPS = 40 pixels/sec)
    scrollPos -= 4;
    if (scrollPos < -(int)(locationAddr.length() * 6)) {
      scrollPos = 128;
    }

    display.display();
  }

  delay(100); 
}
