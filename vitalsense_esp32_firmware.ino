#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <MPU6050_light.h>
#include <Adafruit_MLX90614.h>
#include <MAX30105.h>
#include "spo2_algorithm.h"
#include <NimBLEDevice.h>
#include <HardwareSerial.h>
#include <TinyGPSPlus.h>

// ---------------- HARDWARE CONFIG ----------------
#define SDA_PIN 8
#define SCL_PIN 9
#define GPS_RX_PIN 20
#define GPS_TX_PIN 21
#define GPS_BAUD 9600

// ---------------- CONSTANTS ----------------
#define SERVICE_UUID        "12345678-1234-1234-1234-1234567890ab"
#define CHARACTERISTIC_UUID "abcd1234-1234-1234-1234-abcdef123456"
#define BUFFER_SIZE         100    // Clinical standard for MAX3010x
#define FINGER_THRESHOLD    25000  // Minimum IR to confirm skin contact

// ---------------- SENSOR OBJECTS ----------------
Adafruit_SSD1306 display(128, 64, &Wire, -1);
MPU6050 mpu(Wire);
Adafruit_MLX90614 mlx;
MAX30105 particleSensor;
HardwareSerial gpsSerial(1);
TinyGPSPlus gps;
NimBLECharacteristic* pCharacteristic = NULL;

// ---------------- DATA STORAGE ----------------
uint32_t irBuffer[BUFFER_SIZE];
uint32_t redBuffer[BUFFER_SIZE];
int32_t spo2 = 0, heartRate = 0;
int8_t validSPO2 = 0, validHeartRate = 0;
float bodyTemp = 0, ambientTemp = 0;
bool fingerDetected = false;
float pitch = 0, roll = 0;

// ---------------- FILTERS ----------------
float smoothedHR = 0;
const float HR_FILTER_ALPHA = 0.2; // Smooths out sudden jumps

// ---------------- FALL DETECTION ----------------
bool fallDetected = false;
unsigned long fallTime = 0;

void setupBLE() {
  NimBLEDevice::init("SmartBand");
  NimBLEDevice::setPower(9);
  NimBLEServer* pServer = NimBLEDevice::createServer();
  NimBLEService* pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY
                    );
  pService->start();
  NimBLEAdvertising* pAdv = NimBLEDevice::getAdvertising();
  pAdv->addServiceUUID(SERVICE_UUID);
  pAdv->setScanResponse(true);
  pAdv->start();
}

void setup() {
  Serial.begin(115200);
  Wire.begin(SDA_PIN, SCL_PIN);
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);

  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) Serial.println("OLED Fail");
  
  mlx.begin();
  mpu.begin();
  mpu.calcOffsets();

  if (particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    particleSensor.setup(0x1F, 4, 2, 400, 411, 4096); // Optimized for skin contact
  }

  setupBLE();
}

void loop() {
  // 1. UPDATE GPS
  while (gpsSerial.available() > 0) gps.encode(gpsSerial.read());

  // 2. UPDATE MOTION & FALL
  mpu.update();
  pitch = mpu.getAngleX();
  roll = mpu.getAngleY();
  float accelMag = sqrt(pow(mpu.getAccX(),2) + pow(mpu.getAccY(),2) + pow(mpu.getAccZ(),2));
  if (accelMag > 3.0) { // Simple impact detection
    fallDetected = true;
    fallTime = millis();
  }
  if (fallDetected && millis() - fallTime > 5000) fallDetected = false;

  // 3. UPDATE BIOMETRICS
  long irValue = particleSensor.getIR();
  if (irValue > FINGER_THRESHOLD) {
    fingerDetected = true;
    // Collect data for clinical SPO2 calculation
    for (int i = 0; i < BUFFER_SIZE; i++) {
      while (!particleSensor.available()) particleSensor.check();
      irBuffer[i] = particleSensor.getIR();
      redBuffer[i] = particleSensor.getRed();
      particleSensor.nextSample();
    }
    maxim_heart_rate_and_oxygen_saturation(irBuffer, BUFFER_SIZE, redBuffer, &spo2, &validSPO2, &heartRate, &validHeartRate);
    
    // Apply Low-Pass Filter to Heart Rate
    if (validHeartRate && heartRate > 40 && heartRate < 180) {
      if (smoothedHR == 0) smoothedHR = heartRate;
      else smoothedHR = (heartRate * HR_FILTER_ALPHA) + (smoothedHR * (1.0 - HR_FILTER_ALPHA));
    }
  } else {
    fingerDetected = false;
    smoothedHR = 0;
    spo2 = 0;
  }

  // 4. UPDATE TEMPERATURE (with Sanity Checks)
  float rawObj = mlx.readObjectTempC();
  if (rawObj > 10.0 && rawObj < 50.0) { // Ignore I2C glitches
    // Calibration: Wrist Skin to Core Estimation (+1.8C typical offset)
    bodyTemp = rawObj + 1.8; 
  }
  ambientTemp = mlx.readAmbientTempC();

  // 5. SEND DATA via BLE (CSV CALIBRATED)
  String payload = "P:" + String(pitch,1) + 
                   ",R:" + String(roll,1) + 
                   ",TO:" + String(bodyTemp,1) + 
                   ",TA:" + String(ambientTemp,1) + 
                   ",HR:" + String((int)smoothedHR) + 
                   ",SPO2:" + String(validSPO2 ? spo2 : 0) + 
                   ",FALL:" + String(fallDetected ? 1 : 0) + 
                   ",LAT:" + String(gps.location.lat(), 6) + 
                   ",LNG:" + String(gps.location.lng(), 6) + 
                   ",FIX:" + String(gps.location.isValid() ? 1 : 0) + 
                   ",HAND:" + String(fingerDetected ? 1 : 0);

  pCharacteristic->setValue(payload.c_str());
  pCharacteristic->notify();

  // 6. REFRESH OLED
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0,0);
  display.println(fingerDetected ? "STATUS: ON WRIST" : "STATUS: NO CONTACT");
  display.setCursor(0,20);
  display.print("HR: "); display.println((int)smoothedHR);
  display.print("O2: "); display.println(validSPO2 ? spo2 : 0);
  display.display();

  delay(200); // Standard loop timing
}
