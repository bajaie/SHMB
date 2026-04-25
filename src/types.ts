/**
 * Sensor data structure based on the hardware components provided.
 */
export interface SensorData {
  heartRate: number;
  spo2: number;
  bodyTemp: number;
  ambientTemp: number;
  pitch: number;
  roll: number;
  accelG: number;
  fallStatus: 'STABLE' | 'FREEFALL' | 'IMPACT';
  gps: {
    lat: number;
    lng: number;
    sats: number;
    searching: boolean;
  };
  isWearing: boolean;
  timestamp: number;
}

export const DEFAULT_SENSOR_DATA: SensorData = {
  heartRate: 0,
  spo2: 0,
  bodyTemp: 0,
  ambientTemp: 0,
  pitch: 0,
  roll: 0,
  accelG: 0,
  fallStatus: 'STABLE',
  gps: {
    lat: 0,
    lng: 0,
    sats: 0,
    searching: true,
  },
  isWearing: false,
  timestamp: Date.now(),
};
