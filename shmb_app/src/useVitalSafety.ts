import { useState, useEffect, useRef } from 'react';
import { SensorData } from './BleManager';
import { ALERT_RULES } from './alertRules';

export type AlertLevel = 'normal' | 'warning' | 'risk' | 'critical';
export type MotionState = 'resting' | 'light' | 'active' | 'exercise';

export interface SafetyStatus {
  hrStatus: AlertLevel;
  spo2Status: AlertLevel;
  tempStatus: AlertLevel;
  motionState: MotionState;
  isEmergency: boolean;
}

export const useVitalSafety = (data: SensorData, connected: boolean) => {
  const [status, setStatus] = useState<SafetyStatus>({
    hrStatus: 'normal',
    spo2Status: 'normal',
    tempStatus: 'normal',
    motionState: 'resting',
    isEmergency: false
  });

  const buffer = useRef<{ data: SensorData; ts: number }[]>([]);
  const startTimes = useRef<Record<string, number>>({});
  const baselineHR = useRef<number>(70); // Default baseline

  useEffect(() => {
    if (!connected) return;

    const now = Date.now();
    buffer.current.push({ data: { ...data }, ts: now });
    
    // Keep 5 minutes of buffer
    buffer.current = buffer.current.filter(item => now - item.ts < 300000);

    // --- 1. SENSOR FUSION MOTION CLASSIFICATION ---
    const last30s = buffer.current.filter(item => now - item.ts < 30000);
    const last60s = buffer.current.filter(item => now - item.ts < 60000);
    
    // Calculate Motion Intensity (Variance in orientation)
    const pitchVar = last30s.length > 2 ? Math.max(...last30s.map(d => d.data.pitch)) - Math.min(...last30s.map(d => d.data.pitch)) : 0;
    const rollVar = last30s.length > 2 ? Math.max(...last30s.map(d => d.data.roll)) - Math.min(...last30s.map(d => d.data.roll)) : 0;
    const motionIntensity = Math.max(pitchVar, rollVar);

    // Sustained Motion Check (>20s of significant variance)
    const sustainedMotion = last30s.length > 10 && last30s.filter(d => 
      // Check windowed variance
      true // simplified for now
    ).length > (last30s.length * 0.7);

    // Locomotion Check (GPS)
    const isMovingGPS = data.lat !== 0 && last60s.length > 5 && 
      Math.abs(last60s[0].data.lat - data.lat) > 0.0001;

    // HR Trend Check
    const avgHR = last30s.reduce((acc, curr) => acc + curr.data.heartRate, 0) / (last30s.length || 1);
    const hrElevated = avgHR > (baselineHR.current * 1.25);

    // State Logic
    let motionState: MotionState = 'resting';
    if (isMovingGPS && hrElevated) motionState = 'exercise';
    else if (motionIntensity > 30 && hrElevated) motionState = 'active';
    else if (motionIntensity > 15) motionState = 'light';
    else motionState = 'resting';

    // --- 2. EVALUATE VITAL ALERTS ---
    
    // Gating logic: Suppress warnings if Active/Exercise unless critical
    const isSuppressed = motionState === 'active' || motionState === 'exercise';

    // Heart Rate
    let hrStatus: AlertLevel = 'normal';
    if (data.heartRate > 0 && data.fingerDetected > 0) {
      if (data.heartRate < 40 || data.heartRate > 150) hrStatus = 'critical';
      else if (data.heartRate < 50 || data.heartRate > 120) {
        if (!isSuppressed) {
          const key = data.heartRate < 50 ? 'hr_hypo_risk' : 'hr_hyper_risk';
          if (!startTimes.current[key]) startTimes.current[key] = now;
          if (now - startTimes.current[key] > 120000) hrStatus = 'risk';
        }
      } else if (data.heartRate < 60 || data.heartRate > 100) {
        if (motionState === 'resting') hrStatus = 'warning';
      }
    }

    // SpO2
    let spo2Status: AlertLevel = 'normal';
    if (data.spo2 > 0 && data.fingerDetected > 0) {
      if (data.spo2 < 90) {
        if (!startTimes.current['spo2_critical']) startTimes.current['spo2_critical'] = now;
        if (now - startTimes.current['spo2_critical'] > 30000) spo2Status = 'critical';
      } else if (data.spo2 < 94) {
        if (motionState === 'resting') {
           if (!startTimes.current['spo2_risk']) startTimes.current['spo2_risk'] = now;
           if (now - startTimes.current['spo2_risk'] > 60000) spo2Status = 'risk';
        }
      } else {
        delete startTimes.current['spo2_risk'];
        delete startTimes.current['spo2_critical'];
      }
    }

    const isEmergency = hrStatus === 'critical' || spo2Status === 'critical' || data.fallDetected > 0;

    setStatus({
      hrStatus,
      spo2Status,
      tempStatus: 'normal',
      motionState,
      isEmergency
    });

  }, [data, connected]);

  return status;
};
