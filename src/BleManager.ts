import { SensorData } from './types';
import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';

export class BleManager {
  private deviceId: string | null = null;

  // Calibrated UUIDs from ESP32 source code
  public static SERVICE_UUID = '12345678-1234-1234-1234-1234567890ad';
  public static RX_CHARACTERISTIC_UUID = 'abcd1234-1234-1234-1234-abcdef123466';
  public static TX_CHARACTERISTIC_UUID = 'abcd1234-1234-1234-1234-abcdef123499';

  private onDataCallback: ((data: SensorData) => void) | null = null;

  async sendMessage(msg: string) {
    if (!this.deviceId) return;
    try {
      const encoder = new TextEncoder();
      const value = encoder.encode(msg);
      await BleClient.write(
        this.deviceId,
        BleManager.SERVICE_UUID,
        BleManager.TX_CHARACTERISTIC_UUID,
        new DataView(value.buffer, value.byteOffset, value.byteLength)
      );
    } catch (err) {
      console.error('Message sync failed:', err);
    }
  }

  async sendLocation(lat: number, lng: number) {
    if (!this.deviceId) return;
    try {
      // Shorter format to fit in 23-byte MTU: "L:23.1234,G:90.1234"
      const dataString = `L:${lat.toFixed(5)},G:${lng.toFixed(5)}`;
      const encoder = new TextEncoder();
      const value = encoder.encode(dataString);
      
      await BleClient.write(
        this.deviceId,
        BleManager.SERVICE_UUID,
        BleManager.TX_CHARACTERISTIC_UUID,
        new DataView(value.buffer, value.byteOffset, value.byteLength)
      );
    } catch (error) {
      console.warn('Calibration beam failed:', error);
    }
  }

  async startScan(onDeviceFound: (result: ScanResult) => void) {
    try {
      await BleClient.initialize();
      const isEnabled = await BleClient.isEnabled();
      if (!isEnabled) {
        await BleClient.requestEnable();
      }

      await BleClient.requestLEScan({
        optionalServices: [BleManager.SERVICE_UUID],
      }, (result) => {
        onDeviceFound(result);
      });
    } catch (error) {
      console.error('Scan Error:', error);
      throw error;
    }
  }

  async stopScan() {
    await BleClient.stopLEScan();
  }

  async connect(deviceId: string, onData: (data: SensorData) => void) {
    this.onDataCallback = onData;
    this.deviceId = deviceId;

    try {
      await BleClient.connect(this.deviceId, this.onDisconnected);
      
      // ESP32-C3 handshake
      await BleClient.getServices(this.deviceId);

      await BleClient.startNotifications(
        this.deviceId,
        BleManager.SERVICE_UUID,
        BleManager.RX_CHARACTERISTIC_UUID,
        this.handleNotifications.bind(this)
      );

      console.log('Calibrated connection active on:', BleManager.SERVICE_UUID);
    } catch (error) {
      console.error('BLE Connection Error:', error);
      this.deviceId = null;
      throw error;
    }
  }

  private handleNotifications(value: DataView) {
    const decoder = new TextDecoder();
    const message = decoder.decode(value.buffer);
    console.log('Raw Data Received:', message);

    try {
      // Parse CSV-like format: P:10.5,R:-2.0,TO:36.5,TA:24.0,HR:72,SPO2:98,FALL:0,LAT:23.8103,LNG:90.4125,FIX:1
      const pairs = message.split(',');
      const raw: any = {};
      pairs.forEach(pair => {
        const [key, val] = pair.split(':');
        raw[key] = val;
      });

      const parsed: SensorData = {
        heartRate: parseInt(raw['HR']) || 0,
        spo2: parseInt(raw['SPO2']) || 0,
        bodyTemp: parseFloat(raw['TO']) || 0,
        ambientTemp: parseFloat(raw['TA']) || 0,
        pitch: parseFloat(raw['P']) || 0,
        roll: parseFloat(raw['R']) || 0,
        accelG: 0, // Not explicitly sent as G in your string
        fallStatus: raw['FALL'] === '1' ? 'IMPACT' : 'STABLE',
        isWearing: raw['HAND'] === '1', // New flag from ESP32
        gps: {
          lat: parseFloat(raw['LAT']) || 0,
          lng: parseFloat(raw['LNG']) || 0,
          sats: 0, // Not explicitly sent
          searching: raw['FIX'] !== '1',
        },
        timestamp: Date.now()
      };
      
      if (this.onDataCallback) {
        this.onDataCallback(parsed);
      }
    } catch (e) {
      console.warn('Failed to parse calibrated sensor data:', message);
    }
  }

  private onDisconnected = () => {
    this.deviceId = null;
  };

  async disconnect() {
    if (this.deviceId) {
      try {
        await BleClient.disconnect(this.deviceId);
      } catch (err) {
        console.error('Disconnect error:', err);
      }
      this.deviceId = null;
    }
  }

  isConnected() {
    return this.deviceId !== null;
  }
}

export const bleManager = new BleManager();
