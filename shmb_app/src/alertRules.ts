export interface AlertRule {
  min?: number;
  max?: number;
  persistenceMs: number;
  immediateBelow?: number;
  immediateAbove?: number;
  motionRequired: 'low' | 'any';
}

export interface VitalRules {
  warning: AlertRule;
  risk: AlertRule;
}

export const ALERT_RULES = {
  heartRate: {
    hypo: {
      warning: { min: 50, persistenceMs: 300000, motionRequired: 'low' }, // 5 min
      risk: { min: 40, persistenceMs: 120000, immediateBelow: 40, motionRequired: 'low' }, // 2 min
    },
    hyper: {
      warning: { max: 120, persistenceMs: 120000, motionRequired: 'low' }, // 2 min
      risk: { max: 140, persistenceMs: 120000, immediateAbove: 140, motionRequired: 'low' }, // 2 min
    }
  },
  spo2: {
    warning: { min: 92, max: 94, persistenceMs: 60000, motionRequired: 'any' }, // 1 min
    risk: { min: 90, max: 92, persistenceMs: 120000, motionRequired: 'low' }, // 2 min
    critical: { max: 90, persistenceMs: 30000, immediateBelow: 90, motionRequired: 'any' } // 30 sec
  },
  bodyTemp: {
    hypo: {
      warning: { min: 35.0, max: 36.0, persistenceMs: 600000, motionRequired: 'any' }, // 10 min
      risk: { max: 35.0, persistenceMs: 300000, motionRequired: 'any' } // 5 min
    },
    hyper: {
      warning: { min: 37.5, max: 38.3, persistenceMs: 600000, motionRequired: 'any' }, // 10 min
      risk: { max: 38.3, persistenceMs: 900000, motionRequired: 'any' } // 15 min
    }
  }
};
