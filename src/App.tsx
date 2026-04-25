import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Heart, 
  Thermometer, 
  Navigation, 
  Activity, 
  MapPin, 
  Bluetooth, 
  BluetoothOff,
  AlertTriangle,
  Zap,
  Radio,
  Satellite,
  X,
  Signal,
  Settings
} from 'lucide-react';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { BleManager, bleManager } from './BleManager';
import { SensorData, DEFAULT_SENSOR_DATA } from './types';

// --- Sub-components ---

const DashboardCard = ({ title, icon: Icon, children, className = "", status = "normal" }: any) => {
  const statusStyles: any = {
    normal: "border-white/10 bg-white/[0.03]",
    warning: "border-amber-500/30 bg-amber-500/5",
    danger: "border-red-500/40 bg-red-500/10 shadow-[0_0_25px_rgba(239,68,68,0.1)]",
    active: "border-blue-500/30 bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.05)]"
  };

  return (
    <motion.div 
      layout
      className={`relative p-6 rounded-[32px] border backdrop-blur-md transition-all duration-700 ${statusStyles[status]} ${className}`}
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">{title}</h3>
        <div className={`p-1.5 rounded-lg ${status === 'danger' ? 'bg-red-500/10' : 'bg-white/5'}`}>
          <Icon className={`w-3.5 h-3.5 ${status === 'danger' ? 'text-red-500 animate-pulse' : status === 'active' ? 'text-blue-400' : 'text-zinc-500'}`} />
        </div>
      </div>
      {children}
    </motion.div>
  );
};

const ValueDisplay = ({ label, value, unit, colorClass = "text-white" }: any) => (
  <div className="flex flex-col">
    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">{label}</span>
    <div className="flex items-baseline gap-1">
      <span className={`text-4xl font-light tracking-tighter ${colorClass}`}>{value}</span>
      <span className="text-sm font-medium text-zinc-500">{unit}</span>
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [data, setData] = React.useState<SensorData>(DEFAULT_SENSOR_DATA);
  const [isConnected, setIsConnected] = React.useState(false);
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [isScanning, setIsScanning] = React.useState(false);
  const [discoveredDevices, setDiscoveredDevices] = React.useState<any[]>([]);
  const [lastUpdateTime, setLastUpdateTime] = React.useState<number | null>(null);
  const [connectionError, setConnectionError] = React.useState<string | null>(null);

  // Status check for "Live" data
  const isDataLive = lastUpdateTime ? (Date.now() - lastUpdateTime < 3000) : false;

  const handleConnect = async () => {
    setIsScanning(true);
    setDiscoveredDevices([]);
    try {
      await bleManager.startScan((result: any) => {
        setDiscoveredDevices(prev => {
          const exists = prev.find(d => d.device.deviceId === result.device.deviceId);
          if (exists) {
            return prev.map(d => d.device.deviceId === result.device.deviceId ? result : d);
          }
          return [...prev, result].sort((a, b) => (b.rssi || -100) - (a.rssi || -100));
        });
      });
    } catch (err) {
      console.error(err);
      setIsScanning(false);
    }
  };

  const handleDeviceSelect = async (deviceId: string) => {
    setIsScanning(false);
    setIsConnecting(true);
    setConnectionError(null);
    try {
      await bleManager.stopScan();
      await bleManager.connect(deviceId, (newData: any) => {
        setData(newData);
        setLastUpdateTime(Date.now());
        setIsConnected(true);
      });
    } catch (err: any) {
      console.error(err);
      setConnectionError(err.message || 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    bleManager.disconnect();
    setIsConnected(false);
    setLastUpdateTime(null);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 font-sans selection:bg-blue-500/30 overflow-x-hidden">
      {/* Immersive Background Blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-red-900/10 blur-[120px] animate-pulse" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      <main className="relative max-w-5xl mx-auto p-6 md:p-12 space-y-8">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 pt-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500 mb-2">Hardware Status</p>
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full shadow-[0_0_10px_#3b82f6] transition-colors duration-500 ${isConnected ? 'bg-blue-500' : 'bg-zinc-600 shadow-none'}`} />
              <h1 className="text-2xl font-medium tracking-tight text-white italic">ESP32-C3 Active</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white/[0.03] p-1.5 rounded-2xl border border-white/10 backdrop-blur-md">
            
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                isConnected ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                {isConnected ? 'LIVE' : 'Not Connected'}
              </div>

              {!isConnected ? (
                <button 
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-blue-500 transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] disabled:opacity-50"
                >
                  {isConnecting ? <Activity className="w-3.5 h-3.5 animate-spin" /> : <Bluetooth className="w-3.5 h-3.5" />}
                  Connect
                </button>
              ) : (
                <button 
                  onClick={handleDisconnect}
                  className="flex items-center gap-2 px-6 py-2.5 bg-white/5 border border-red-500/20 text-red-500 text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-red-500/10 transition-all"
                >
                  <BluetoothOff className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              )}
            </div>
          </div>
          
          {connectionError && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-xs animate-shake">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <p>{connectionError}</p>
            </div>
          )}
        </header>

        {/* Status Banner */}
        {!data.isWearing && isConnected && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-amber-500/10 border border-amber-500/20 rounded-[2rem] flex items-center gap-4"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-500">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-amber-500 font-bold text-sm tracking-tight">NO SKIN CONTACT DETECTED</h3>
              <p className="text-amber-500/60 text-[10px] uppercase font-black tracking-widest mt-1">Biometrics may be inaccurate or unavailable</p>
            </div>
          </motion.div>
        )}

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Heart & Oxygen */}
          <DashboardCard 
            title="Biometrics Monitor" 
            icon={Heart} 
            className="md:col-span-2"
            status={!data.isWearing ? 'normal' : (data.heartRate > 100 || data.heartRate < 50 ? 'warning' : 'active')}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
              <div className="flex items-center gap-8">
                <div className="relative">
                  <div className={`absolute inset-[-12px] rounded-full blur-xl transition-colors duration-1000 ${data.isWearing && data.heartRate > 0 ? 'bg-red-500/20' : 'bg-transparent'}`} />
                  <Heart className={`w-14 h-14 text-red-500 transition-all duration-300 ${data.isWearing && data.heartRate > 0 ? 'animate-pulse-custom drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'opacity-20'}`} />
                </div>
                <ValueDisplay label="Pulse Rate" value={data.isWearing ? (data.heartRate || "--") : "--"} unit="BPM" colorClass={data.isWearing ? "text-zinc-100" : "text-zinc-700"} />
              </div>
              <div className="flex items-center gap-8 border-t sm:border-t-0 sm:border-l border-white/5 pt-8 sm:pt-0 sm:pl-10">
                <div className="relative">
                  <div className={`absolute inset-[-12px] rounded-full blur-xl transition-colors duration-1000 ${data.isWearing && data.spo2 > 0 ? 'bg-blue-500/20' : 'bg-transparent'}`} />
                  <Zap className={`w-12 h-12 text-blue-400 transition-all duration-300 ${data.isWearing && data.spo2 > 0 ? 'drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'opacity-20'}`} />
                </div>
                <ValueDisplay label="SpO2 Level" value={data.isWearing ? (data.spo2 || "--") : "--"} unit="%" colorClass={data.isWearing ? "text-zinc-100" : "text-zinc-700"} />
              </div>
            </div>
            <div className="mt-8 flex gap-1.5 h-12 items-end overflow-hidden">
               {[...Array(60)].map((_, i) => (
                 <motion.div 
                   key={i}
                   animate={{ 
                     height: isConnected ? [8, Math.random() * 32 + 4, 8] : [4, 4, 4],
                     opacity: isConnected ? [0.1, 0.4, 0.1] : 0.05
                   }}
                   transition={{ repeat: Infinity, duration: 2, delay: i * 0.03 }}
                   className="flex-1 bg-blue-500 rounded-full"
                 />
               ))}
            </div>
          </DashboardCard>

          {/* Temperature */}
          <DashboardCard title="Environmentals" icon={Thermometer}>
            <div className="space-y-8">
              <ValueDisplay label="Core Temp" value={data.bodyTemp.toFixed(1)} unit="°C" colorClass="text-zinc-100" />
              <div className="relative h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(10, Math.min(100, (data.bodyTemp / 42) * 100))}%` }}
                  className="h-full bg-gradient-to-r from-blue-500 to-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]"
                />
              </div>
              <div className="flex justify-between items-center bg-black/30 p-4 rounded-2xl border border-white/5">
                <span className="text-[10px] font-bold text-zinc-600 uppercase">Ambient</span>
                <span className="text-sm font-mono text-zinc-400">{data.ambientTemp.toFixed(1)}°C</span>
              </div>
            </div>
          </DashboardCard>

          {/* Motion/Fall Detection */}
          <DashboardCard title="Motion Safety" icon={Activity} status={data.fallStatus !== 'STABLE' ? 'danger' : 'normal'}>
            <div className="space-y-6">
               <div className="flex justify-between items-center p-3 bg-black/40 rounded-2xl border border-white/5 mb-2">
                 <span className="text-[10px] font-bold text-zinc-500 uppercase px-2">Status</span>
                 <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-xl">
                   <div className={`w-1.5 h-1.5 rounded-full ${data.fallStatus === 'STABLE' ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-red-500 animate-bounce'}`} />
                   <span className={`text-[10px] font-bold uppercase tracking-widest ${data.fallStatus === 'STABLE' ? 'text-emerald-500' : 'text-red-500'}`}>
                     {data.fallStatus}
                   </span>
                 </div>
               </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-white/[0.02] rounded-3xl border border-white/5">
                  <span className="text-[9px] font-bold text-zinc-600 uppercase block mb-1">Pitch</span>
                  <span className="text-xl font-light text-white tracking-tighter">{data.pitch.toFixed(1)}°</span>
                </div>
                <div className="p-4 bg-white/[0.02] rounded-3xl border border-white/5">
                  <span className="text-[9px] font-bold text-zinc-600 uppercase block mb-1">Roll</span>
                  <span className="text-xl font-light text-white tracking-tighter">{data.roll.toFixed(1)}°</span>
                </div>
              </div>
              
              <div className="relative h-16 flex items-center justify-center bg-black/50 border border-white/5 rounded-3xl overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#ffffff05_1px,transparent_1px)] bg-[size:10px_10px]" />
                <motion.div 
                  animate={{ rotateX: data.pitch, rotateZ: data.roll }}
                  className="w-20 h-1.5 bg-blue-500/80 rounded-full shadow-[0_0_15px_#3b82f6]"
                />
                <span className="absolute bottom-2 right-4 text-[9px] font-mono text-zinc-600 font-bold tracking-widest">{data.accelG.toFixed(2)} G</span>
              </div>
            </div>
          </DashboardCard>

          {/* GPS Section */}
          <DashboardCard title="Network Geolocation" icon={MapPin} className="md:col-span-2">
            <div className="flex flex-col lg:flex-row gap-10">
              <div className="space-y-6 lg:min-w-[200px]">
                <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-2xl border border-white/5">
                  <Satellite className={`w-3.5 h-3.5 ${data.gps.searching ? 'animate-bounce text-zinc-500' : 'text-blue-400'}`} />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Satellites: {data.gps.sats}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center bg-black p-3.5 border border-white/5 rounded-2xl">
                    <span className="text-[9px] font-bold text-zinc-600 tracking-[0.2em]">LATITUDE</span>
                    <span className="text-xs font-mono text-white tracking-tight">{data.gps.searching ? "SCANNING..." : data.gps.lat.toFixed(6)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-black p-3.5 border border-white/5 rounded-2xl">
                    <span className="text-[9px] font-bold text-zinc-600 tracking-[0.2em]">LONGITUDE</span>
                    <span className="text-xs font-mono text-white tracking-tight">{data.gps.searching ? "SCANNING..." : data.gps.lng.toFixed(6)}</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 relative min-h-[160px] bg-black rounded-[28px] border border-white/5 overflow-hidden group">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#3b82f60a_0%,transparent_70%)]" />
                <div className="absolute inset-0 opacity-10 flex flex-col justify-between p-4 pointer-events-none">
                   {[...Array(4)].map((_, i) => <div key={i} className="h-[1px] w-full bg-white/50" />)}
                   <div className="absolute inset-0 flex justify-between px-4">
                     {[...Array(8)].map((_, i) => <div key={i} className="w-[1px] h-full bg-white/50" />)}
                   </div>
                </div>
                <div className="relative z-10 h-full flex flex-col items-center justify-center">
                  <div className="relative mb-4">
                    <div className={`absolute inset-0 rounded-full blur-md opacity-40 transition-colors duration-700 ${data.gps.searching ? 'bg-zinc-500' : 'bg-blue-500'}`} />
                    <MapPin className={`w-10 h-10 transition-all duration-700 ${data.gps.searching ? 'text-zinc-700 scale-90' : 'text-blue-500 scale-110 drop-shadow-[0_0_12px_#3b82f6]'}`} />
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
                    {data.gps.searching ? "Searching Sky..." : "Positioning Fixed"}
                  </p>
                </div>
                {/* Radar Sweep Effect */}
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                  className="absolute top-1/2 left-1/2 -ml-[200px] -mt-[200px] w-[400px] h-[400px] border-t border-blue-500/10 rounded-full"
                />
              </div>
            </div>
          </DashboardCard>

          {/* System Info */}
          <DashboardCard title="Hardware Logic" icon={Radio}>
            <div className="space-y-4">
              <div className="bg-black/30 p-4 rounded-2xl border border-white/5 space-y-3">
                <div className="flex justify-between">
                  <span className="text-[10px] font-bold text-zinc-600 uppercase">Input protocol</span>
                  <span className="text-[10px] font-mono text-zinc-400">JSON/BLE</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] font-bold text-zinc-600 uppercase">Frequency</span>
                  <span className="text-[10px] font-mono text-zinc-200">2.4 GHz</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] font-bold text-zinc-600 uppercase">Device ID</span>
                  <span className="text-[10px] font-mono text-blue-500">VITAL_E3C</span>
                </div>
              </div>
              <details className="group">
                <summary className="flex items-center gap-2 py-2 cursor-pointer list-none border-t border-white/5">
                  <Zap className="w-3 h-3 text-blue-500 group-open:rotate-180 transition-transform" />
                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Protocol Spec</span>
                </summary>
                <div className="mt-2 p-3 bg-black border border-white/5 rounded-xl font-mono text-[8px] text-zinc-600 leading-relaxed overflow-x-auto">
                  {`{"hr":bpm, "spo2":%, "bt":degC, "at":degC, "p":p, "r":r, "ag":g, "fs":"STABLE", "glat":lat, "glng":lng, "gs":num, "gn":bool}`}
                </div>
              </details>
              <div className="flex gap-2">
                <button className="flex-1 bg-white/5 border border-white/10 py-3 rounded-xl text-[9px] font-bold uppercase tracking-widest text-zinc-500 hover:bg-white/10 transition-colors">Reset</button>
                <button className="flex-1 bg-red-600/20 border border-red-500/40 py-3 rounded-xl text-[9px] font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/30 transition-colors">Emergency</button>
              </div>
            </div>
          </DashboardCard>

        </div>

        {/* Footer */}
        <footer className="pt-16 pb-12 flex flex-col items-center gap-4 border-t border-white/5">
          <div className="h-1 w-32 bg-white/10 rounded-full" />
          <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.4em]">
            Autonomous Biosensing Mesh • System Active
          </p>
        </footer>

      </main>
      {/* Scanner Modal */}
      {isScanning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl"
          >
            <div className="p-8 border-b border-white/5 flex flex-col gap-4 bg-zinc-900/50">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Nearby Sensors</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                    <p className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Deep Scanning...</p>
                  </div>
                </div>
                <button 
                  onClick={() => { bleManager.stopScan(); setIsScanning(false); }}
                  className="p-3 hover:bg-white/5 rounded-full text-zinc-400 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <button
                onClick={async () => {
                  try {
                    await bleManager.stopScan();
                    setIsScanning(false);
                    setIsConnecting(true);
                    // Use the built-in system picker
                    const device = await BleClient.requestDevice();
                    await handleDeviceSelect(device.deviceId);
                  } catch (e) {
                    console.error(e);
                    setIsConnecting(false);
                    setIsScanning(true);
                  }
                }}
                className="w-full py-3 bg-blue-600/20 border border-blue-500/40 text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-blue-600/30 transition-all flex items-center justify-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Use System Picker (Better Name Detection)
              </button>
            </div>
            
            <div className="max-h-[450px] overflow-y-auto p-6 space-y-3 custom-scrollbar">
              {discoveredDevices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                  <div className="relative mb-6">
                    <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full" />
                    <Activity className="w-12 h-12 animate-spin text-blue-500 relative z-10" />
                  </div>
                  <p className="text-sm font-medium">Looking for VitalSense devices...</p>
                  <p className="text-[10px] text-zinc-600 mt-2 text-center max-w-[200px]">Make sure your sensor is powered on and within 5 meters.</p>
                </div>
              ) : (
                discoveredDevices.map((result) => (
                  <button
                    key={result.device.deviceId}
                    onClick={() => handleDeviceSelect(result.device.deviceId)}
                    className="w-full flex items-center justify-between p-5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 rounded-3xl transition-all group active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-400 group-hover:scale-110 transition-transform">
                        <Bluetooth className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <div className="text-base font-bold text-white group-hover:text-blue-400 transition-colors">
                            {result.localName || result.device.name || 
                             (result.uuids?.includes(BleManager.SERVICE_UUID) ? 'SmartBand (SENSOR FOUND)' : `Device ${result.device.deviceId.split(':').pop()}`)}
                          </div>
                          {result.uuids?.includes(BleManager.SERVICE_UUID) && (
                            <span className="px-1.5 py-0.5 bg-blue-500/20 border border-blue-500/30 text-blue-400 text-[8px] font-black uppercase rounded-md tracking-tighter">
                              Official Hardware
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                          ID: {result.device.deviceId}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex gap-0.5 items-end h-3">
                        {[1, 2, 3, 4].map((bar) => {
                          const strength = (result.rssi || -100);
                          const isActive = bar === 1 ? strength > -90 :
                                         bar === 2 ? strength > -80 :
                                         bar === 3 ? strength > -70 :
                                         strength > -60;
                          return (
                            <div 
                              key={bar}
                              className={`w-1 rounded-t-sm transition-all ${
                                isActive ? 'bg-blue-500' : 'bg-white/10'
                              }`}
                              style={{ height: `${bar * 25}%` }}
                            />
                          );
                        })}
                      </div>
                      <span className="text-[9px] font-bold text-zinc-500 uppercase">{result.rssi} dBm</span>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="p-6 bg-zinc-950/50 border-t border-white/5 text-center">
              <p className="text-[10px] text-zinc-500 italic">Tapping a device will start the handshake process.</p>
            </div>
          </motion.div>
        </div>
      )}

      {/* Connecting Overlay */}
      {isConnecting && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center"
          >
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-blue-500/30 blur-[60px] animate-pulse" />
              <Activity className="w-20 h-20 text-blue-500 animate-spin relative z-10" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Establishing Connection</h2>
            <p className="text-zinc-400 text-sm animate-pulse">Requesting secure handshake with sensor...</p>
            
            <div className="mt-12 w-48 h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-blue-500"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 3, repeat: Infinity }}
              />
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
