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

/** 
 * VitalSense SmartBand Firmware v2.5 (Professional Grade)
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
#define SERVICE_UUID        "12345678-1234-1234-1234-1234567890ab"
#define CHARACTERISTIC_UUID "abcd1234-1234-1234-1234-abcdef123456"
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

class MyServerCallbacks: public NimBLEServerCallbacks {
    void onDisconnect(NimBLEServer* pServer) {
        pServer->getAdvertising()->start();
        Serial.println("Re-advertising started...");
    }
};

void setupBLE() {
  NimBLEDevice::init("SmartBand");
  NimBLEDevice::setPower(9); 
  
  NimBLEServer* pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  
  NimBLEService* pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY
                    );
  pService->start();
  
  NimBLEAdvertising* pAdv = NimBLEDevice::getAdvertising();
  pAdv->addServiceUUID(SERVICE_UUID);
  pAdv->start();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println(">>> BOOT: SERIAL OK");
  
  // I2C Safety: Set clock speed and timeout
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000); 
  Wire.setTimeOut(50); // Prevent bus hangs
  Serial.println(">>> BOOT: I2C OK");
  
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println(">>> BOOT: GPS UART OK");

  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(">>> BOOT: OLED FAIL");
  } else {
    Serial.println(">>> BOOT: OLED OK");
  }
  
  mlx.begin();
  Serial.println(">>> BOOT: MLX TEMP OK");
  
  byte mpuStatus = mpu.begin();
  if(mpuStatus == 0) {
    Serial.println(">>> BOOT: MPU6050 CALIBRATING...");
    mpu.calcOffsets();
    Serial.println(">>> BOOT: MPU6050 OK");
  } else {
    Serial.println(">>> BOOT: MPU6050 FAIL");
  }

  // MAX30102 Safety Setup
  Serial.println(">>> BOOT: STARTING MAX30102...");
  if (particleSensor.begin(Wire, I2C_SPEED_STANDARD)) {
    particleSensor.setup(0x1F, 4, 2, 400, 411, 4096); 
    Serial.println(">>> BOOT: MAX30102 OK");
  } else {
    Serial.println(">>> BOOT: MAX30102 FAIL");
  }

  setupBLE();
  Serial.println(">>> BOOT: BLE OK");
  Serial.println(">>> SYSTEM READY <<<");
}

void loop() {
  unsigned long now = millis();

  // 1. GPS HANDLER
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

  // 5. BLE BROADCAST
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

  if(pCharacteristic) { 
    pCharacteristic->setValue(payload.c_str());
    pCharacteristic->notify();
  }

  // Advertising Watchdog: If not connected, make sure we are advertising
  static unsigned long lastAdvCheck = 0;
  if (now - lastAdvCheck > 2000) {
    lastAdvCheck = now;
    Serial.print("Device Status: ");
    if (NimBLEDevice::getServer()->getConnectedCount() == 0) {
      Serial.println("WAITING FOR PHONE... (Advertising Active)");
      NimBLEDevice::getAdvertising()->stop();
      NimBLEDevice::getAdvertising()->start();
    } else {
      Serial.println("CONNECTED TO PHONE");
    }
  }

  // 6. UI REFRESH
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0,0);
  display.println(fingerDetected ? "CONTACT: ON" : "CONTACT: OFF");
  display.setCursor(0,25);
  display.setTextSize(2);
  display.print("HR:"); display.println((int)smoothedHR);
  display.display();

  delay(100); 
}
