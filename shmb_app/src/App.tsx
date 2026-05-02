import React, { useState, useEffect, useMemo } from 'react';
import { HashRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Geolocation } from '@capacitor/geolocation';
import { BleManager, SensorData } from './BleManager';
import { useVitalSafety, AlertLevel } from './useVitalSafety';
import { ALERT_RULES } from './alertRules';

// Leaflet icon fix
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const bleManager = new BleManager();

// --- MEDICAL LOGIC & HELPERS (WHO STANDARDS) ---

type VitalLevel = 'optimal' | 'warning' | 'critical' | 'offline';
type Gender = 'Male' | 'Female';

interface UserProfile {
  name: string;
  age: number;
  gender: Gender;
}

interface VitalInterpretation {
  label: string;
  status: VitalLevel;
  explanation: string;
  color: string;
}

const getHeartRateStatus = (hr: number, connected: boolean, profile: UserProfile, fingerDetected: number, level: AlertLevel): VitalInterpretation => {
  if (!connected) return { label: 'Offline', status: 'offline', explanation: 'Check band connection', color: 'text-slate-400' };
  if (fingerDetected === 0) return { label: 'No Signal', status: 'offline', explanation: 'Ensure band is snug', color: 'text-slate-300' };
  if (hr === 0) return { label: 'Reading...', status: 'optimal', explanation: 'Stabilizing pulse signal', color: 'text-blue-500 animate-pulse' };
  
  if (level === 'critical') return { label: 'Emergency', status: 'critical', explanation: 'Extreme HR - Immediate Alert', color: 'text-error' };
  if (level === 'risk') return { label: 'High Risk', status: 'critical', explanation: 'Abnormal HR - Motion Validated', color: 'text-error' };
  if (level === 'warning') return { label: 'Warning', status: 'warning', explanation: 'Slight Deviation Detected', color: 'text-tertiary' };
  
  return { label: 'Optimal', status: 'optimal', explanation: 'Clinically Stable', color: 'text-secondary' };
};

const getSpO2Status = (spo2: number, connected: boolean, profile: UserProfile, fingerDetected: number, level: AlertLevel): VitalInterpretation => {
  if (!connected) return { label: 'Offline', status: 'offline', explanation: 'Check sensor contact', color: 'text-slate-400' };
  if (fingerDetected === 0) return { label: 'No Signal', status: 'offline', explanation: 'Place finger correctly', color: 'text-slate-300' };
  if (spo2 === 0) return { label: 'Reading...', status: 'optimal', explanation: 'Calibrating oxygen', color: 'text-blue-500 animate-pulse' };
  
  if (level === 'critical') return { label: 'Critical', status: 'critical', explanation: 'Oxygen dangerously low', color: 'text-error' };
  if (level === 'risk') return { label: 'Risk', status: 'critical', explanation: 'Sustained low oxygen', color: 'text-error' };
  if (level === 'warning') return { label: 'Caution', status: 'warning', explanation: 'Slightly below baseline', color: 'text-tertiary' };

  return { label: 'Healthy', status: 'optimal', explanation: 'Oxygen levels optimal', color: 'text-secondary' };
};

const getTempStatus = (temp: number, connected: boolean, profile: UserProfile, level: AlertLevel): VitalInterpretation => {
  if (!connected || temp === 0) return { label: 'Offline', status: 'offline', explanation: 'Syncing...', color: 'text-slate-400' };
  
  if (level === 'risk') return { label: 'Fever', status: 'critical', explanation: 'Sustained abnormal temp', color: 'text-error' };
  if (level === 'warning') return { label: 'Warm', status: 'warning', explanation: 'Rising temperature trend', color: 'text-tertiary' };

  return { label: 'Normal', status: 'optimal', explanation: 'Body temp is healthy', color: 'text-secondary' };
};

// --- COMPONENTS ---

const MapUpdater = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    if (center[0] !== 0 && center[1] !== 0) {
      map.setView(center, 15, { animate: true });
    }
  }, [center, map]);
  return null;
};

const BottomNav = () => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed bottom-0 w-full z-[1000] flex justify-around items-center px-4 pb-6 pt-3 bg-white/80 backdrop-blur-md rounded-t-2xl shadow-[0_-4px_20px_rgba(59,130,246,0.08)]">
      <Link to="/" className={`flex flex-col items-center justify-center px-3 py-1.5 rounded-xl transition-all duration-150 ${isActive('/') ? 'bg-blue-50 text-blue-700 scale-95' : 'text-slate-400'}`}>
        <span className="material-symbols-outlined" style={{ fontVariationSettings: isActive('/') ? "'FILL' 1" : "" }}>dashboard</span>
        <span className="text-[11px] font-medium tracking-wide">Monitor</span>
      </Link>
      <Link to="/map" className={`flex flex-col items-center justify-center px-3 py-1.5 rounded-xl transition-all duration-150 ${isActive('/map') ? 'bg-blue-50 text-blue-700 scale-95' : 'text-slate-400'}`}>
        <span className="material-symbols-outlined" style={{ fontVariationSettings: isActive('/map') ? "'FILL' 1" : "" }}>map</span>
        <span className="text-[11px] font-medium tracking-wide">Location</span>
      </Link>
      <Link to="/profile" className={`flex flex-col items-center justify-center px-3 py-1.5 rounded-xl transition-all duration-150 ${isActive('/profile') ? 'bg-blue-50 text-blue-700 scale-95' : 'text-slate-400'}`}>
        <span className="material-symbols-outlined" style={{ fontVariationSettings: isActive('/profile') ? "'FILL' 1" : "" }}>person</span>
        <span className="text-[11px] font-medium tracking-wide">Me</span>
      </Link>
    </nav>
  );
};

const Header = ({ connected, onConnect, isAlert, profile }: { connected: boolean, onConnect: () => void, isAlert: boolean, profile: UserProfile }) => {
  const navigate = useNavigate();
  return (
    <header className={`${isAlert ? 'bg-error text-white' : 'bg-slate-50/90 text-on-surface'} backdrop-blur-md shadow-sm fixed top-0 w-full z-[1000] flex justify-between items-center px-5 py-3 transition-colors duration-500`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/20">
          <img alt="User" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDuNVJD3HXiDJhxTsG2BxQI0BnaHEXhvMYQN3guMzJLiAAmiXsUL4aOiUM610okqB-nfIPNl-fGdM_3zjG07malsKFgWVcUaipEZIdyGqEYBLOr7VM6HfsQQ4-7wr8fVM1tgxkbhjehxbIc5_rVtbXr1S3oaAFNNzuI3AT3JiZhAH423RJReDTFaHnSjEehnqKK7SKC4Pkmx4T-oGGVN4fdQ8HazD7J0YpAqVqwyinZz4mwVdO_kVuTQcvag2r8fFTb8AF3jzJeIGQL" />
        </div>
        <div className="flex flex-col">
          <span className={`font-bold text-sm ${isAlert ? 'text-white' : 'text-blue-600'}`}>SHMB</span>
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${connected ? (isAlert ? 'bg-white' : 'bg-secondary') : 'bg-slate-300'}`}></div>
            <span className={`text-[10px] uppercase font-bold ${isAlert ? 'text-white/80' : 'text-slate-500'}`}>Status - {connected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!connected && (
          <button onClick={onConnect} className="bg-primary text-white px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm">
            Sync Band
          </button>
        )}
        <button onClick={() => navigate('/profile')} className={`p-2 rounded-full hover:bg-black/5 transition-colors ${isAlert ? 'text-white' : 'text-slate-500'}`}>
          <span className="material-symbols-outlined">settings</span>
        </button>
      </div>
    </header>
  );
};

// --- ALERT VIEW ---

const AlertView = ({ data, onDismiss }: { data: SensorData, onDismiss: () => void }) => {
  return (
    <div className="fixed inset-0 z-[2000] bg-error flex flex-col items-center justify-center p-10 text-white text-center animate-pulse-alert">
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-white/30 rounded-full animate-ring-alert"></div>
        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center relative">
          <span className="material-symbols-outlined text-error text-5xl font-bold">warning</span>
        </div>
      </div>
      
      <h1 className="text-display-lg font-black mb-2 uppercase tracking-tighter">Emergency</h1>
      <p className="text-headline-md font-medium mb-12 opacity-90">Critical health alert detected. Emergency contacts notified.</p>

      <div className="grid grid-cols-3 gap-4 w-full max-w-sm mb-12">
        <div className="bg-white/10 backdrop-blur-md p-4 rounded-3xl">
          <p className="text-label-md opacity-70 uppercase tracking-widest">Heart</p>
          <p className="text-headline-md font-black">{data.heartRate}</p>
        </div>
        <div className="bg-white/10 backdrop-blur-md p-4 rounded-3xl">
          <p className="text-label-md opacity-70 uppercase tracking-widest">Oxygen</p>
          <p className="text-headline-md font-black">{data.spo2}%</p>
        </div>
        <div className="bg-white/10 backdrop-blur-md p-4 rounded-3xl border border-white/20">
          <p className="text-label-md opacity-70 uppercase tracking-widest">Impact</p>
          <p className="text-headline-md font-black">{data.impactG}G</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-sm">
        <button className="bg-white text-error py-5 rounded-3xl text-headline-md font-black shadow-2xl active:scale-95 transition-transform">
          Call Emergency
        </button>
        <button onClick={onDismiss} className="bg-transparent border-2 border-white/30 text-white py-4 rounded-3xl text-label-md font-bold uppercase tracking-widest active:scale-95 transition-transform">
          Dismiss Alarm
        </button>
      </div>
    </div>
  );
};

// --- PAGES ---

const DashboardPage = ({ data, connected, onConnect, profile, safety, address }: { data: SensorData, connected: boolean, onConnect: () => void, profile: UserProfile, safety: any, address: string }) => {
  const hrInfo = getHeartRateStatus(data.heartRate, connected, profile, data.fingerDetected, safety.hrStatus);
  const spo2Info = getSpO2Status(data.spo2, connected, profile, data.fingerDetected, safety.spo2Status);
  const tempInfo = getTempStatus(data.bodyTemp, connected, profile, safety.tempStatus);

  return (
    <main className="pt-24 px-5 max-w-5xl mx-auto space-y-8 pb-32">
      <section className="space-y-1">
        <h1 className="text-headline-lg text-on-background font-black">Hey {profile.name}, here are your vitals</h1>
      </section>

      {connected && data.fingerDetected === 0 && (
        <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-700">
            <span className="material-symbols-outlined">sensors_off</span>
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-amber-900">Watch Not Detected</h4>
            <p className="text-xs text-amber-700">Please ensure the band is snug on your wrist for accurate vital readings.</p>
          </div>
          <span className="material-symbols-outlined text-amber-400 animate-pulse">priority_high</span>
        </section>
      )}

      {!connected && (
        <section className="bg-surface-container-high rounded-3xl p-6 border-2 border-dashed border-primary/20 flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-3xl animate-pulse">bluetooth_searching</span>
          </div>
          <div>
            <h3 className="text-headline-md text-on-surface">Band Offline</h3>
            <p className="text-body-md text-on-surface-variant text-sm">Synchronize your SHMB Band to begin tracking.</p>
          </div>
          <button onClick={onConnect} className="bg-primary text-on-primary px-8 py-3 rounded-2xl text-label-md shadow-lg active:scale-95 transition-transform font-bold">
            Connect Now
          </button>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        <div className="md:col-span-8 bg-surface-container-lowest rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between min-h-[220px]">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-error">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>favorite</span>
                <span className="text-label-md uppercase tracking-widest font-black">Heart Rhythm</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-display-lg font-black ${hrInfo.color}`}>{connected && data.fingerDetected > 0 && data.heartRate > 0 && data.heartRate < 210 ? data.heartRate : '--'}</span>
                <span className="text-body-lg text-on-surface-variant font-medium">BPM</span>
              </div>
            </div>
            <div className="text-right">
              <span className={`block text-headline-md font-black ${hrInfo.color}`}>{hrInfo.label}</span>
              <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">{hrInfo.explanation}</span>
            </div>
          </div>
          <div className="h-24 w-full mt-6 flex items-end gap-1.5 opacity-40">
            {[40, 60, 45, 70, 90, 65, 50, 40, 75, 55, 60, 40].map((h, i) => (
              <div key={i} className={`flex-1 rounded-t-full transition-all duration-500 ${i === 8 ? 'bg-error' : 'bg-slate-200'}`} style={{ height: `${h}%` }}></div>
            ))}
          </div>
        </div>

        <div className="md:col-span-4 bg-surface-container-lowest rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center gap-2 text-secondary">
            <span className="material-symbols-outlined font-black">motion_sensor_active</span>
            <span className="text-label-md uppercase tracking-widest font-black">Stability</span>
          </div>
          <div className="py-6 flex flex-col items-center text-center">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${data.fallDetected ? 'bg-error/10 text-error animate-pulse' : 'bg-secondary/10 text-secondary'}`}>
              <span className="material-symbols-outlined text-4xl">{data.fallDetected ? 'running_with_errors' : 'accessibility_new'}</span>
            </div>
            <p className="text-body-md text-on-surface font-bold">
              {data.fallDetected ? 'CRITICAL: FALL DETECTED' : 'Stable'}
            </p>
          </div>
        </div>

        <div className="md:col-span-6 bg-surface-container-lowest rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 text-blue-600">
              <span className="material-symbols-outlined font-black">air</span>
              <span className="text-label-md uppercase tracking-widest font-black">Saturation</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className={`text-data-lg font-black ${spo2Info.color}`}>{connected && data.fingerDetected > 0 && data.spo2 > 0 ? data.spo2 : '--'}</span>
              <span className="text-body-lg text-on-surface-variant font-medium">%</span>
            </div>
            <div className="text-right">
              <span className={`block font-black ${spo2Info.color}`}>{spo2Info.label}</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{spo2Info.explanation}</span>
            </div>
          </div>
          <div className="w-full bg-slate-50 h-3 rounded-full overflow-hidden border border-slate-100">
            <div className={`h-full rounded-full transition-all duration-700 ${spo2Info.status === 'optimal' ? 'bg-secondary' : spo2Info.status === 'warning' ? 'bg-tertiary' : 'bg-error'}`} style={{ width: `${connected ? (data.spo2 || 0) : 0}%` }}></div>
          </div>
        </div>

        <div className="md:col-span-6 bg-surface-container-lowest rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 text-primary">
              <span className="material-symbols-outlined font-black">thermostat</span>
              <span className="text-label-md uppercase tracking-widest font-black">Body Heat</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className={`text-data-lg font-black ${tempInfo.color}`}>{connected && data.bodyTemp > 0 ? data.bodyTemp.toFixed(1) : '--'}</span>
              <span className="text-body-lg text-on-surface-variant font-medium">°C</span>
            </div>
            <div className="text-right">
              <span className={`block font-black ${tempInfo.color}`}>{tempInfo.label}</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{tempInfo.explanation}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-blue-50/50 p-2 rounded-xl">
             <span className="material-symbols-outlined text-sm text-blue-400">info</span>
             <span className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">Ambient Temp: {data.ambientTemp.toFixed(1)}°C</span>
          </div>
        </div>
      </div>
    </main>
  );
};

const MapPage = ({ data, onConnect, connected, address }: { data: SensorData, onConnect: () => void, connected: boolean, address: string }) => {
  const mapCenter: [number, number] = connected && data.lat !== 0 ? [data.lat, data.lng] : [33.6844, 73.0479];

  return (
    <main className="flex-1 mt-16 mb-24 overflow-hidden relative flex flex-col h-screen">
      <section className="flex-1 relative w-full overflow-hidden">
        <div className="absolute inset-0 z-0">
          <MapContainer center={mapCenter} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={mapCenter} />
            <MapUpdater center={mapCenter} />
          </MapContainer>
        </div>
        
        <div className="absolute top-6 left-6 right-6 z-[500]">
          <div className="bg-white/95 backdrop-blur-md p-4 rounded-[24px] shadow-xl border border-white/50">
            <div className="flex items-center justify-between mb-4">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white">
                    <span className="material-symbols-outlined">explore</span>
                  </div>
                  <div>
                    <h2 className="text-label-md font-black text-on-surface uppercase tracking-widest">Live Address</h2>
                    <p className="text-[10px] text-blue-600 font-bold uppercase truncate max-w-[200px]">{connected && data.lat !== 0 ? address : 'Searching GPS...'}</p>
                  </div>
               </div>
               <button className="bg-slate-100 p-2 rounded-xl text-slate-500"><span className="material-symbols-outlined text-sm font-black">share</span></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 p-2 rounded-xl text-center">
                <span className="text-[9px] text-slate-400 font-bold uppercase block">Lat</span>
                <span className="text-xs font-black font-mono">{connected && data.lat !== 0 ? data.lat?.toFixed(6) : '----'}</span>
              </div>
              <div className="bg-slate-50 p-2 rounded-xl text-center">
                <span className="text-[9px] text-slate-400 font-bold uppercase block">Lng</span>
                <span className="text-xs font-black font-mono">{connected && data.lng !== 0 ? data.lng?.toFixed(6) : '----'}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

const ProfilePage = ({ profile, onUpdate }: { profile: UserProfile, onUpdate: (p: UserProfile) => void }) => {
  const [formData, setFormData] = useState(profile);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate(formData);
    alert("Health Profile Saved Successfully!");
  };

  return (
    <main className="max-w-xl mx-auto px-5 pt-24 pb-32">
      <section className="mb-8">
        <h2 className="text-headline-lg text-on-surface font-black">Health Profile</h2>
      </section>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white p-6 rounded-[28px] shadow-sm border border-slate-100 space-y-6">
           <div className="space-y-2">
             <label className="text-label-md font-black uppercase tracking-widest text-slate-400 ml-1">Full Name</label>
             <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full h-14 px-6 bg-slate-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
           </div>
           
           <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
               <label className="text-label-md font-black uppercase tracking-widest text-slate-400 ml-1">Age</label>
               <input type="number" value={formData.age} onChange={e => setFormData({...formData, age: parseInt(e.target.value)})} className="w-full h-14 px-6 bg-slate-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
             </div>
             <div className="space-y-2">
               <label className="text-label-md font-black uppercase tracking-widest text-slate-400 ml-1">Gender</label>
               <select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value as Gender})} className="w-full h-14 px-6 bg-slate-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-blue-500 outline-none appearance-none">
                 <option value="Male">Male</option>
                 <option value="Female">Female</option>
               </select>
             </div>
           </div>
        </div>
        

        <button type="submit" className="w-full h-16 bg-blue-600 text-white rounded-[24px] font-black uppercase tracking-widest text-sm shadow-xl shadow-blue-100 active:scale-95 transition-transform mt-6">
          Save
        </button>
      </form>
    </main>
  );
};

// --- APP CORE ---

function App() {
  const [data, setData] = useState<SensorData>({
    heartRate: 0, spo2: 0, bodyTemp: 0, ambientTemp: 0, pitch: 0, roll: 0, fallDetected: 0, lat: 0, lng: 0, fixTier: 0, fingerDetected: 0, impactG: 0, firmwareVersion: 'unknown'
  });
  const [connected, setConnected] = useState(false);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [address, setAddress] = useState<string>('Searching location...');
  
  const safety = useVitalSafety(data, connected);

  // Persistent Profile
  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('vs_profile');
    return saved ? JSON.parse(saved) : { name: 'Noor', age: 25, gender: 'Female' };
  });

  useEffect(() => {
    bleManager.onConnectionChange((isConnected) => {
      setConnected(isConnected);
    });

    bleManager.onData((newData) => {
      setData(newData);
    });
  }, [profile]);

  const isAlertActive = safety.isEmergency && !alertDismissed;

  // Reverse Geocoding & Sync Logic
  useEffect(() => {
    if (!connected) return;

    const syncLocation = async () => {
      try {
        let lat = data.lat;
        let lng = data.lng;

        try {
          // Attempt High Precision Phone GPS
          const pos = await Geolocation.getCurrentPosition({ timeout: 3000 });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch (gpsError) {
          console.warn('Phone GPS unavailable, falling back to Band GPS');
        }

        if (lat === 0) return;

        // 2. Resolve Address
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
          headers: { 'Accept-Language': 'en' }
        });
        const json = await res.json();
        
        if (json.display_name) {
          const fullAddress = json.display_name;
          const shortAddress = fullAddress.split(',').slice(0, 2).join(',');
          
          setAddress(fullAddress);
          
          // 3. Send Calibration Packet
          await bleManager.write(`L:${lat.toFixed(6)},G:${lng.toFixed(6)}`);
          
          // 4. Send Address Packet (Separate to ensure no MTU truncation or comma collision)
          setTimeout(() => {
             bleManager.write(`A:${shortAddress}`);
          }, 100);
        }
      } catch (e) {
        console.warn('Location sync failed:', e);
      }
    };

    const timer = setTimeout(syncLocation, 5000); // Sync every 5s if moving
    return () => clearTimeout(timer);
  }, [connected, data.lat, data.lng]);

  const updateProfile = (newProfile: UserProfile) => {
    setProfile(newProfile);
    localStorage.setItem('vs_profile', JSON.stringify(newProfile));
  };

  return (
    <HashRouter>
      <Header connected={connected} onConnect={() => bleManager.connect()} isAlert={isAlertActive} profile={profile} />
      {isAlertActive && <AlertView data={data} onDismiss={() => setAlertDismissed(true)} />}
      <Routes>
        <Route path="/" element={<DashboardPage data={data} connected={connected} onConnect={() => bleManager.connect()} profile={profile} safety={safety} address={address} />} />
        <Route path="/map" element={<MapPage data={data} onConnect={() => bleManager.connect()} connected={connected} address={address} />} />
        <Route path="/profile" element={<ProfilePage profile={profile} onUpdate={updateProfile} />} />
      </Routes>
      <BottomNav />
    </HashRouter>
  );
}

export default App;
