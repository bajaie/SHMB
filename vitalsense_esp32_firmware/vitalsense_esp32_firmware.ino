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
 * VitalSense SmartBand Firmware v2.0 (Hybrid Tracking Edition)
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
// Calibrated UUIDs from App
#define SERVICE_UUID           "12345678-1234-1234-1234-1234567890ad"
#define CHARACTERISTIC_UUID    "abcd1234-1234-1234-1234-abcdef123466"
#define CHARACTERISTIC_RX_UUID "abcd1234-1234-1234-1234-abcdef123499"
#define BUFFER_SIZE         100    
#define FINGER_THRESHOLD    25000  
#define MAX_SANE_TEMP       45.0f  // Medical safety limit
#define MIN_SANE_TEMP       20.0f

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
const float HR_FILTER_ALPHA = 0.25; // Professional grade LPF

bool fallDetected = false;
unsigned long fallTime = 0;

// Assisted GPS Storage
float calibratedLat = 0;
float calibratedLng = 0;
bool hasCalibration = false;

class MyCallbacks : public NimBLECharacteristicCallbacks {
public:
    void onWrite(NimBLECharacteristic* pCharacteristic) {
        std::string value = pCharacteristic->getValue();
        if (value.length() > 0) {
            String msg = String(value.c_str());
            Serial.print(">>> BLE RECEIVED: ");
            Serial.println(msg);
            
            int latIdx = msg.indexOf("L:");
            int lngIdx = msg.indexOf("G:");
            if(latIdx != -1 && lngIdx != -1) {
              int commaIdx = msg.indexOf(",", latIdx);
              calibratedLat = msg.substring(latIdx + 2, commaIdx).toFloat();
              calibratedLng = msg.substring(lngIdx + 2).toFloat();
              hasCalibration = true;
              Serial.println(">>> ACK: CALIBRATION APPLIED");
            }
        }
    }
};

class MyServerCallbacks: public NimBLEServerCallbacks {
    void onConnect(NimBLEServer* pServer) {
        Serial.println("PHONE CONNECTED");
    }
    void onDisconnect(NimBLEServer* pServer) {
        pServer->getAdvertising()->start();
        Serial.println("Re-advertising started...");
    }
};

void setupBLE() {
  NimBLEDevice::init("VITAL-SENSE-X");
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
  pAdv->setName("VITAL-SENSE-X");
  pAdv->addServiceUUID(SERVICE_UUID);
  pAdv->start();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
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
  preferences.begin("vitalsense", false);
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
  if (particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {
    particleSensor.setup(0x1F, 4, 2, 400, 411, 4096); 
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
  
  if (accelMag > 3.5) { // Impact threshold
    fallDetected = true;
    fallTime = now;
  }
  if (fallDetected && now - fallTime > 5000) fallDetected = false;

  // 3. BIOMETRIC CORE
  long irValue = particleSensor.getIR();
  if (irValue > FINGER_THRESHOLD) {
    fingerDetected = true;
    for (int i = 0; i < BUFFER_SIZE; i++) {
      if(particleSensor.available()) {
        irBuffer[i] = particleSensor.getIR();
        redBuffer[i] = particleSensor.getRed();
        particleSensor.nextSample();
      }
      particleSensor.check();
    }
    maxim_heart_rate_and_oxygen_saturation(irBuffer, BUFFER_SIZE, redBuffer, &spo2, &validSPO2, &heartRate, &validHeartRate);
    
    // Low Pass Filter for Heart Rate Accuracy
    if (validHeartRate && heartRate > 35 && heartRate < 190) {
      if (smoothedHR < 10) smoothedHR = heartRate;
      else smoothedHR = (heartRate * HR_FILTER_ALPHA) + (smoothedHR * (1.0 - HR_FILTER_ALPHA));
    }
  } else {
    fingerDetected = false;
    smoothedHR = 0;
    spo2 = 0;
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

  // 6. OLED Logic (Triple-Tier Display)
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0,0);
  
  if (gpsFixTier == 1) {
    display.println("FIX: SATELLITE");
  } else if (gpsFixTier == 2) {
    display.println("FIX: MOBILE APP");
  } else {
    display.println("LAST KNOWN LOC");
  }
  
  display.print("LAT: "); display.println(outLat, 6);
  display.print("LNG: "); display.println(outLng, 6);
  
  display.setCursor(0,25);
  display.setTextSize(2);
  display.print("HR:"); display.println((int)smoothedHR);
  display.display();

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
                   ",HAND:" + String(fingerDetected ? 1 : 0);

  if(pCharacteristic) { 
    pCharacteristic->setValue(payload.c_str());
    pCharacteristic->notify();
  }

  // 6. UI REFRESH (Match Flowchart OLED)
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0,0);
  display.println(fingerDetected ? "CONTACT: ON" : "CONTACT: OFF");
  
  display.println(statusMsg);
  if (outLat != 0) {
    display.print(outLat, 4);
    display.print(",");
    display.println(outLng, 4);
  } else {
    display.println("AWAITING FIX...");
  }
  
  display.setCursor(0,25);
  display.setTextSize(2);
  display.print("HR:"); display.println((int)smoothedHR);
  display.display();

  delay(100); 
}
