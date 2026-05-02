import { BleClient } from '@capacitor-community/bluetooth-le';

export interface SensorData {
  pitch: number;
  roll: number;
  bodyTemp: number;
  ambientTemp: number;
  heartRate: number;
  spo2: number;
  fallDetected: number;
  lat: number;
  lng: number;
  fixTier: number;
  fingerDetected: number;
  impactG: number;
  firmwareVersion: string;
}

// Android 9 BLE radio needs time to switch from scan mode to connection mode.
// Calling connectGatt() within ~300ms of scan stop triggers GATT error 133.
const PRE_CONNECT_DELAY_MS = 350;

// Small pause after connect() resolves before startNotifications.
// The plugin resolves connect only after MTU and service discovery complete,
// so this is just a safety margin for the GATT stack to fully settle.
const POST_CONNECT_DELAY_MS = 150;

// Longer timeout to give Android 9's slow GATT stack room to respond.
const CONNECT_TIMEOUT_MS = 12000;

// GATT error 133 on Android 9 fails ~50% of first attempts.
const MAX_CONNECT_ATTEMPTS = 3;

export class BleManager {
  public static SERVICE_UUID = '12345678-1234-1234-1234-1234567890ae';
  public static RX_CHARACTERISTIC_UUID = 'abcd1234-1234-1234-1234-abcdef123466';
  public static TX_CHARACTERISTIC_UUID = 'abcd1234-1234-1234-1234-abcdef123499';

  private deviceId: string | null = null;
  private onDataCallback: ((data: SensorData) => void) | null = null;
  private onConnectCallback: ((connected: boolean) => void) | null = null;
  private initPromise: Promise<void>;
  private rxBuffer = '';

  constructor() {
    this.initPromise = this.init();
  }

  private async init() {
    try {
      // androidNeverForLocation: false keeps Location required for BLE scanning
      // on Android 6–11, which is a hard OS requirement on those versions.
      await BleClient.initialize({ androidNeverForLocation: false });
    } catch {
      // Already initialized — safe to ignore
    }
  }

  onData(callback: (data: SensorData) => void) {
    this.onDataCallback = callback;
  }

  onConnectionChange(callback: (connected: boolean) => void) {
    this.onConnectCallback = callback;
  }

  async write(message: string) {
    if (!this.deviceId) return;
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(message);
      // Create a DataView that specifically covers the encoded bytes
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      
      await BleClient.write(
        this.deviceId,
        BleManager.SERVICE_UUID,
        BleManager.TX_CHARACTERISTIC_UUID,
        view
      );
      console.log('BLE Write success:', message);
    } catch (e) {
      console.warn('BLE Write failed:', e);
    }
  }

  async connect() {
    await this.initPromise;

    try {
      const enabledResult = await BleClient.isEnabled() as any;
      const isEnabled = typeof enabledResult === 'boolean'
        ? enabledResult
        : (enabledResult?.value === true);

      if (!isEnabled) {
        try {
          await BleClient.requestEnable();
        } catch {
          alert('Please enable Bluetooth to connect to your SHMB Band.');
          return;
        }
      }

      // Android 6–11 requires Location Services to be ON (not just permitted)
      // for BLE to work. This is a system-level restriction, not a permission.
      try {
        const locResult = await BleClient.isLocationEnabled() as any;
        const locEnabled = typeof locResult === 'boolean'
          ? locResult
          : (locResult?.value === true);
        if (!locEnabled) {
          alert('Location Services must be enabled for Bluetooth on Android 9. Opening settings…');
          try { await BleClient.openLocationSettings(); } catch {}
          return;
        }
      } catch {
        // isLocationEnabled not available on all platforms — continue anyway
      }

      const device = await BleClient.requestDevice({
        services: [BleManager.SERVICE_UUID],
        name: "SHMB"
      });
      this.deviceId = device.deviceId;

      // Android 9: wait for the BLE adapter to finish stopping the scan before
      // attempting to connect. Without this, connectGatt() fails with GATT error 133.
      await new Promise(r => setTimeout(r, PRE_CONNECT_DELAY_MS));

      let lastError: unknown;
      for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
        // Tear down any stale GATT handle from a previous failed attempt.
        // A leftover handle on Android 9 will block a fresh connectGatt() call.
        try { await BleClient.disconnect(this.deviceId); } catch {}

        try {
          await BleClient.connect(
            this.deviceId,
            (id) => {
              console.log('Disconnected:', id);
              this.deviceId = null;
              if (this.onConnectCallback) this.onConnectCallback(false);
            },
            { timeout: CONNECT_TIMEOUT_MS }
          );
          lastError = undefined;
          break;
        } catch (e) {
          lastError = e;
          console.warn(`BLE connect attempt ${attempt}/${MAX_CONNECT_ATTEMPTS} failed:`, e);
          if (attempt < MAX_CONNECT_ATTEMPTS) {
            // Exponential backoff — gives the BLE controller time to reset
            await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        }
      }
      if (lastError) throw lastError;

      // The plugin resolves connect() only after service discovery + MTU negotiation
      // (MTU 512 is requested internally). This small pause lets the GATT state
      // fully commit before we issue the descriptor write for notifications.
      await new Promise(r => setTimeout(r, POST_CONNECT_DELAY_MS));

      this.rxBuffer = '';
      await BleClient.startNotifications(
        this.deviceId,
        BleManager.SERVICE_UUID,
        BleManager.RX_CHARACTERISTIC_UUID,
        (value) => {
          const chunk = new TextDecoder().decode(new Uint8Array(value.buffer));
          this.rxBuffer += chunk;

          // HAND: is always the last field. Buffer until we have a complete frame,
          // which handles the rare case where notifications still arrive fragmented.
          const match = this.rxBuffer.match(/(.*HAND:\d+)/);
          if (match) {
            const packet = match[1];
            this.rxBuffer = this.rxBuffer
              .slice(this.rxBuffer.indexOf(packet) + packet.length)
              .replace(/^[\s,]+/, '');
            const data = this.parsePayload(packet.trim());
            if (this.onDataCallback) this.onDataCallback(data);
          }
        }
      );
      if (this.onConnectCallback) this.onConnectCallback(true);
    } catch (err: any) {
      console.error('BLE connection failed:', err);
      alert(`Connection failed: ${err?.message ?? 'Ensure Bluetooth and Location Services are both enabled.'}`);
    }
  }

  async sendLocation(lat: number, lng: number) {
    if (!this.deviceId) return;
    const payload = `L:${lat.toFixed(6)},G:${lng.toFixed(6)}`;
    const encoder = new TextEncoder();
    const value = encoder.encode(payload);
    await BleClient.write(
      this.deviceId,
      BleManager.SERVICE_UUID,
      BleManager.TX_CHARACTERISTIC_UUID,
      new DataView(value.buffer, value.byteOffset, value.byteLength)
    );
  }

  private parsePayload(payload: string): SensorData {
    const data: any = {
      pitch: 0, roll: 0, bodyTemp: 0, ambientTemp: 0,
      heartRate: 0, spo2: 0, fallDetected: 0,
      lat: 0, lng: 0, fixTier: 0, fingerDetected: 0,
      impactG: 0, firmwareVersion: 'unknown'
    };
    payload.split(',').forEach(part => {
      const [key, val] = part.split(':');
      switch (key?.trim()) {
        case 'P': data.pitch = parseFloat(val); break;
        case 'R': data.roll = parseFloat(val); break;
        case 'TO': data.bodyTemp = parseFloat(val); break;
        case 'TA': data.ambientTemp = parseFloat(val); break;
        case 'HR': data.heartRate = parseInt(val); break;
        case 'SPO2': data.spo2 = parseInt(val); break;
        case 'FALL': data.fallDetected = parseInt(val); break;
        case 'LAT': data.lat = parseFloat(val); break;
        case 'LNG': data.lng = parseFloat(val); break;
        case 'FIX': data.fixTier = parseInt(val); break;
        case 'HAND': data.fingerDetected = parseInt(val); break;
        case 'G': data.impactG = parseFloat(val); break;
        case 'V': data.firmwareVersion = val; break;
      }
    });
    return data as SensorData;
  }
}
