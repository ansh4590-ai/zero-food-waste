import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from "motion/react";
import { Button } from "./ui/button";
import { Link } from "react-router-dom";
import { 
  CheckCircle2, Play, Pause, Camera, ScanLine, 
  Smartphone, Box, Activity,
  ShieldCheck, FileCheck2, User,
  Utensils, Clock, Route
} from "lucide-react";

const DEMO_STEPS = [
  {
    id: "upload",
    duration: 8, // 0-8 sec
    title: "Donor Upload",
    icon: Camera,
    Component: () => (
      <div className="flex flex-col items-center justify-center h-full w-full bg-white dark:bg-[#131616] p-6 text-center shadow-inner rounded-xl relative overflow-hidden">
        <div className="absolute top-4 left-4 bg-gray-100 dark:bg-white/5 px-3 py-1 rounded-full text-xs font-medium text-gray-500 flex items-center gap-2">
           <Smartphone className="w-3 h-3" /> Donor App
        </div>
        <div className="w-16 h-16 bg-[#2f6f57]/10 rounded-full flex items-center justify-center mb-4 mt-8">
          <Camera className="w-8 h-8 text-[#2f6f57]" />
        </div>
        <div className="w-3/4 max-w-[200px] h-32 bg-gray-100 dark:bg-white/5 rounded-xl border-2 border-dashed border-gray-300 dark:border-white/20 flex flex-col items-center justify-center shadow-inner">
          <span className="text-sm font-medium text-gray-500 dark:text-white/40">Capturing Food...</span>
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 2 }} className="mt-3 text-xs bg-[#2f6f57] text-white px-3 py-1.5 rounded-md font-medium shadow-sm">
            Paneer & Roti (20 meals)
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 4 }} className="mt-6">
          <Button size="sm" className="bg-[#2f6f57] hover:bg-[#235844] text-white rounded-full px-6">Upload Listing</Button>
        </motion.div>
      </div>
    )
  },
  {
    id: "ai",
    duration: 7, // 8-15 sec
    title: "AI Analysis",
    icon: ScanLine,
    Component: () => (
      <div className="flex flex-col items-center justify-center h-full w-full bg-white dark:bg-[#131616] p-6 text-center border-t-[6px] border-[#2f6f57] relative">
        <div className="absolute inset-0 bg-[#2f6f57]/5 flex items-center justify-center overflow-hidden">
           <motion.div animate={{ top: ['0%', '100%', '0%'] }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} className="absolute w-full h-[2px] bg-[#2f6f57] shadow-[0_0_15px_#2f6f57] z-10" />
        </div>
        <ScanLine className="w-12 h-12 text-[#2f6f57] animate-pulse mb-6 relative z-10" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 relative z-10">AI Integrity Check</h3>
        <div className="space-y-3 w-full max-w-[220px] text-left relative z-10">
          <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 1 }} className="flex justify-between items-center text-sm bg-green-50 dark:bg-green-900/20 px-4 py-2 bg-opacity-90 backdrop-blur rounded-lg border border-green-100 dark:border-green-800/30">
            <span className="text-green-700 dark:text-green-400 font-medium">Freshness Check</span>
            <span className="font-bold text-green-700 dark:text-green-400">Pass (92%)</span>
          </motion.div>
          <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 2.5 }} className="flex justify-between items-center text-sm bg-blue-50 dark:bg-blue-900/20 px-4 py-2 bg-opacity-90 backdrop-blur rounded-lg border border-blue-100 dark:border-blue-800/30">
            <span className="text-blue-700 dark:text-blue-400 font-medium">Safe Window</span>
            <span className="font-bold text-blue-700 dark:text-blue-400">4 Hours</span>
          </motion.div>
        </div>
      </div>
    )
  },
  {
    id: "receiver",
    duration: 10, // 15-25 sec
    title: "NGO Request",
    icon: Box,
    Component: () => (
      <div className="flex flex-col items-center justify-center h-full w-full bg-gray-50 dark:bg-[#0f1111] p-6">
        <div className="w-full max-w-[260px]">
          <div className="w-full bg-white dark:bg-[#171a1a] p-4 rounded-xl shadow-sm border border-gray-100 dark:border-white/5 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">Hope Center</p>
                <p className="text-[10px] text-gray-500 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded mt-0.5 inline-block">NGO</p>
              </div>
            </div>
          </div>
          
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1 }} className="w-full bg-white dark:bg-[#1a1d1d] shadow-lg border border-gray-100 dark:border-white/10 p-5 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-[#10b981] text-white text-[9px] font-bold px-2 py-1 uppercase rounded-bl-lg">New matching food</div>
            <h4 className="font-bold text-gray-900 dark:text-white mb-1 mt-2">Paneer & Roti</h4>
            <p className="text-xs text-gray-500 mb-4 flex items-center gap-1.5"><Box className="w-3 h-3"/> 20 Meals • 1.2km away</p>
            <motion.div whileTap={{ scale: 0.95 }}>
              <Button size="sm" className="w-full bg-[#2f6f57] text-white font-bold h-9">Request Food</Button>
            </motion.div>
          </motion.div>
        </div>
      </div>
    )
  },
  {
    id: "volunteer",
    duration: 10, // 25-35 sec
    title: "Volunteer Claim",
    icon: Smartphone,
    Component: () => (
      <div className="relative flex flex-col items-center justify-center h-full w-full bg-[#0a0c0c] text-white p-6 overflow-hidden">
        {/* Mock Map Background grid */}
        <div className="absolute inset-0 z-0 opacity-[0.15] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_90%_90%_at_50%_50%,#000_20%,transparent_100%)] pointer-events-none" />
        
        {/* Radar / Glow behind map */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-gradient-to-tr from-[#10b981]/20 to-[#3b82f6]/20 blur-[60px] rounded-full pointer-events-none z-0" />
        
        <div className="absolute inset-0 z-0 overflow-hidden flex items-center justify-center opacity-80 pointer-events-none">
           {/* Mock Route Line with Gradient */}
           <svg className="absolute w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
             <defs>
               <linearGradient id="routeGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                 <stop offset="0%" stopColor="#10b981" />
                 <stop offset="100%" stopColor="#3b82f6" />
               </linearGradient>
               <filter id="glow">
                 <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
                 <feMerge>
                   <feMergeNode in="coloredBlur"/>
                   <feMergeNode in="SourceGraphic"/>
                 </feMerge>
               </filter>
             </defs>
             <path d="M 20 80 Q 40 50 80 20" fill="none" stroke="url(#routeGradient)" strokeWidth="1.2" strokeDasharray="3 3" filter="url(#glow)" className="animate-[dash_20s_linear_infinite]" />
             
             {/* Map Pins */}
             <circle cx="20" cy="80" r="2.5" fill="#10b981" />
             <circle cx="80" cy="20" r="2.5" fill="#3b82f6" />
             
             {/* Ping rings */}
             <circle cx="20" cy="80" r="6" fill="none" stroke="#10b981" strokeWidth="0.5" className="animate-ping" opacity="0.8" />
             <circle cx="80" cy="20" r="6" fill="none" stroke="#3b82f6" strokeWidth="0.5" className="animate-ping" opacity="0.8" style={{ animationDelay: '1s' }} />
           </svg>
        </div>

        {/* Floating Card */}
        <motion.div 
          initial={{ y: 30, opacity: 0, scale: 0.95 }} 
          animate={{ y: 0, opacity: 1, scale: 1 }} 
          transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.5 }} 
          className="z-10 bg-[#171a1a]/70 backdrop-blur-xl p-5 rounded-3xl w-full max-w-[260px] border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.6)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
               <span className="relative flex h-2 w-2">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10b981]"></span>
               </span>
               <h3 className="text-xs font-bold text-[#10b981] uppercase tracking-widest">New Rescue</h3>
            </div>
            <div className="bg-white/5 border border-white/10 px-2 py-0.5 rounded-full text-[9px] font-bold text-white/60 uppercase tracking-widest">High Priority</div>
          </div>
          
          {/* Details */}
          <div className="bg-black/40 rounded-2xl p-4 mb-5 border border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-[#10b981]/10 blur-xl rounded-full pointer-events-none" />
            
            <div className="flex items-center gap-3 mb-4">
               <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0 border border-white/10 shadow-sm">
                 <Utensils className="w-3.5 h-3.5 text-[#10b981]" />
               </div>
               <div>
                 <p className="text-[9px] text-white/40 font-bold uppercase tracking-wider mb-0.5">Pickup</p>
                 <p className="text-[13px] font-bold text-white/90 leading-none truncate w-[130px]">Fresh Bite Cafe</p>
               </div>
            </div>
            
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0 border border-white/10 shadow-sm">
                 <User className="w-3.5 h-3.5 text-[#3b82f6]" />
               </div>
               <div>
                 <p className="text-[9px] text-white/40 font-bold uppercase tracking-wider mb-0.5">Dropoff</p>
                 <p className="text-[13px] font-bold text-white/90 leading-none truncate w-[130px]">Hope Center</p>
               </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
              <div>
                <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold">Est. Time</p>
                <p className="text-[11px] font-bold text-white/90 mt-1 flex items-center gap-1.5"><Clock className="w-3 h-3 text-[#10b981]"/> 15 mins</p>
              </div>
              <div>
                <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold text-right">Distance</p>
                <p className="text-[11px] font-bold text-white/90 mt-1 text-right flex items-center justify-end gap-1.5"><Route className="w-3 h-3 text-[#3b82f6]"/> 2.4 km</p>
              </div>
            </div>
          </div>

          {/* Button */}
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }} 
            className="relative w-full overflow-hidden bg-[#2f6f57] hover:bg-[#10b981] text-white font-bold py-3.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#10b981]/20 transition-all duration-300 border border-white/10 group"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out pointer-events-none" />
            <ShieldCheck className="w-4 h-4 relative z-10 opacity-90" /> 
            <span className="relative z-10 tracking-wide text-[13px]">Claim Route</span>
          </motion.button>
        </motion.div>
      </div>
    )
  },
  {
    id: "pickup",
    duration: 10, // 35-45 sec
    title: "QR Pickup",
    icon: ScanLine,
    Component: () => (
      <div className="flex flex-col items-center justify-center h-full w-full bg-white dark:bg-[#131616] p-6 text-center">
        <h3 className="font-bold text-gray-900 dark:text-white mb-6 text-lg">Scan to verify pickup</h3>
        <div className="relative mb-8">
          <div className="w-40 h-40 bg-gray-50 dark:bg-[#1a1d1d] rounded-3xl shadow-inner border-2 border-dashed border-gray-200 dark:border-white/10 p-4 flex items-center justify-center overflow-hidden">
            <div className="w-full h-full bg-[url('https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=verified_pickup')] bg-contain bg-no-repeat bg-center opacity-60 dark:invert rounded-lg mix-blend-multiply dark:mix-blend-screen" />
          </div>
          {/* Scanner Line Animation */}
          <motion.div animate={{ top: ['0%', '100%', '0%'] }} transition={{ repeat: Infinity, duration: 3, ease: "linear" }} className="absolute left-[-10%] right-[-10%] h-[3px] bg-[#10b981] shadow-[0_0_15px_#10b981] z-10 rounded-full" />
        </div>
        
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 3 }} className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 px-4 py-2 rounded-full flex items-center gap-2">
           <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
           <span className="text-sm font-bold text-green-700 dark:text-green-400">Food Secured</span>
        </motion.div>
      </div>
    )
  },
  {
    id: "delivery",
    duration: 10, // 45-55 sec
    title: "Verified Handoff",
    icon: FileCheck2,
    Component: () => (
      <div className="flex flex-col items-center justify-center h-full w-full bg-[#f0fdf4] dark:bg-[#064e3b]/20 p-6 text-center border-l-[8px] border-green-500 relative overflow-hidden">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5, delay: 0.2 }} className="w-24 h-24 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-green-500/10">
          <CheckCircle2 className="w-12 h-12 text-green-500" />
        </motion.div>
        
        <motion.h3 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="text-3xl font-black text-green-800 dark:text-green-400 mb-2">Delivery Complete</motion.h3>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }} className="text-green-600 dark:text-green-300 font-medium opacity-80 mb-6">Receiver confirmed handoff</motion.p>
        
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2 }} className="bg-white/60 dark:bg-black/20 backdrop-blur px-5 py-4 rounded-2xl border border-green-200 dark:border-green-800/30 w-full max-w-[240px]">
          <p className="text-xs text-green-700/70 dark:text-green-300/60 uppercase font-bold tracking-wider mb-3">Verification Matrix</p>
          <div className="flex flex-col gap-2.5">
            <div className="flex justify-between items-center text-sm font-medium text-green-900 dark:text-green-100">
              <span>QR Matching</span>
              <span className="bg-green-500 text-white px-2 py-0.5 rounded text-xs shadow-sm">Valid</span>
            </div>
            <div className="flex justify-between items-center text-sm font-medium text-green-900 dark:text-green-100">
              <span>Delivery Speed</span>
              <span className="bg-green-500 text-white px-2 py-0.5 rounded text-xs shadow-sm">Optimal</span>
            </div>
          </div>
        </motion.div>
      </div>
    )
  },
  {
    id: "dashboard",
    duration: 5, // 55-60 sec
    title: "Impact Analytics",
    icon: Activity,
    Component: () => (
      <div className="flex flex-col items-center justify-center h-full w-full bg-white dark:bg-[#131616] p-6 px-4 md:px-6">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full bg-[#2f6f57] text-white rounded-[2rem] p-8 text-center shadow-2xl relative overflow-hidden">
          {/* subtle background decor */}
          <div className="absolute top-[-50%] right-[-10%] w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          
          <Activity className="w-10 h-10 mx-auto mb-4 opacity-90" />
          <motion.h3 
            initial={{ y: 20, opacity: 0 }} 
            animate={{ y: 0, opacity: 1 }} 
            transition={{ delay: 0.3 }}
            className="text-5xl font-black tracking-tight mb-2"
          >
            1,489
          </motion.h3>
          <p className="text-sm text-[#a7f3d0] font-bold uppercase tracking-widest mb-8">Meals Rescued Today</p>
          
          <div className="pt-5 border-t border-white/20 flex justify-between items-center text-xs text-white/90 font-medium">
            <span className="flex flex-col text-left">
               <span className="opacity-70">CO2 Saved</span>
               <span className="text-sm font-bold mt-0.5">4.2 kg</span>
            </span>
            <span className="flex flex-col text-right">
               <span className="opacity-70">Avg Status</span>
               <span className="text-sm font-bold mt-0.5 mt-0.5 flex items-center gap-1 justify-end"><div className="w-1.5 h-1.5 bg-green-400 rounded-full"/> Optimal</span>
            </span>
          </div>
        </motion.div>
      </div>
    )
  }
];

export function DemoSection() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setElapsedMs(prev => {
          const next = prev + 50;
          return next >= 60000 ? 0 : next;
        });
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  let currentStep = 0;
  let timeWalker = 0;
  let stepProgress = 0;

  for (let i = 0; i < DEMO_STEPS.length; i++) {
    const stepMs = DEMO_STEPS[i].duration * 1000;
    if (elapsedMs >= timeWalker && (elapsedMs < timeWalker + stepMs || i === DEMO_STEPS.length - 1)) {
      currentStep = i;
      stepProgress = ((elapsedMs - timeWalker) / stepMs) * 100;
      break;
    }
    timeWalker += stepMs;
  }
  
  const totalProgress = (elapsedMs / 60000) * 100;

  const formatTime = (ms: number) => {
    const totalSeconds = ms / 1000;
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (idx: number) => {
    let targetTime = 0;
    for (let i = 0; i < idx; i++) {
      targetTime += DEMO_STEPS[i].duration * 1000;
    }
    setElapsedMs(targetTime);
  };

  const CurrentComponent = DEMO_STEPS[currentStep].Component;

  return (
    <section className="py-24 bg-white dark:bg-[#0f1111] border-b border-gray-200 dark:border-white/5 transition-colors overflow-hidden" id="demo">
      <div className="max-w-7xl mx-auto px-6 relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          
          {/* Left Text Content */}
          <div className="order-2 lg:order-1 flex flex-col justify-center">
            <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
              <div className="inline-flex items-center rounded-full border border-[#2f6f57]/20 bg-[#2f6f57]/5 px-3 py-1 text-xs font-bold text-[#2f6f57] tracking-widest uppercase mb-6">
                Product Demo
              </div>
              
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 dark:text-white mb-6 leading-tight">
                See Zero Food Waste <span className="text-[#2f6f57]">in Action</span>
              </h2>
              
              <p className="text-lg md:text-xl text-gray-600 dark:text-white/60 leading-relaxed mb-8 max-w-lg">
                From surplus meals to verified delivery in under a minute. Experience the complete end-to-end logistics platform.
              </p>

              <ul className="space-y-5 mb-10 max-w-md">
                {[
                  "AI verifies real food instantly",
                  "NGOs request nearby meals",
                  "Volunteers navigate and deliver",
                  "QR-secured pickup & handoff",
                  "Live impact analytics dashboard",
                ].map((item, i) => (
                  <motion.li 
                    key={i} 
                    initial={{ opacity: 0, x: -10 }} 
                    whileInView={{ opacity: 1, x: 0 }} 
                    viewport={{ once: true }} 
                    transition={{ duration: 0.4, delay: 0.2 + (i * 0.1) }}
                    className="flex items-start gap-4"
                  >
                    <div className="w-6 h-6 rounded-full bg-[#2f6f57]/10 flex items-center justify-center shrink-0 mt-0.5">
                       <CheckCircle2 className="w-4 h-4 text-[#2f6f57]" />
                    </div>
                    <span className="font-semibold text-gray-800 dark:text-white text-[15px]">{item}</span>
                  </motion.li>
                ))}
              </ul>

              <div className="flex flex-col sm:flex-row gap-4 mb-10 w-full sm:w-auto">
                <Button 
                  onClick={() => setIsPlaying(!isPlaying)}
                  size="lg" 
                  className="h-14 px-8 text-base font-bold bg-[#2f6f57] text-white hover:bg-[#235844] dark:bg-white dark:text-black dark:hover:bg-gray-200 transition-all rounded-full border-0 shadow-lg shadow-[#2f6f57]/20"
                >
                  {isPlaying ? <Pause className="w-5 h-5 mr-3" /> : <Play className="w-5 h-5 mr-3" />}
                  {isPlaying ? "Pause Demo" : "Watch 60-sec Demo"}
                </Button>
                <Button 
                  asChild
                  size="lg" 
                  className="h-14 px-8 text-base font-bold bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 dark:bg-[#171a1a] dark:text-white dark:border-white/10 dark:hover:border-white/30 dark:hover:bg-[#1e2323] transition-all rounded-full shadow-sm dark:shadow-none"
                >
                  <Link to="/register">Start Rescuing Food</Link>
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[10px] tracking-[0.1em] font-bold text-gray-400 dark:text-white/40 uppercase cursor-default">
                <span>Built for India</span>
                <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-white/20" />
                <span>Real-time</span>
                <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-white/20" />
                <span>Verified</span>
                <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-white/20" />
                <span>Zero Food Waste</span>
              </div>
            </motion.div>
          </div>

          {/* Right Demo Player Form Factor */}
          <div className="order-1 lg:order-2 w-full max-w-[420px] mx-auto lg:mr-0 z-10 relative perspective-[1000px]">
            {/* Ambient shadow/glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[#2f6f57]/10 dark:bg-[#2f6f57]/20 blur-[80px] rounded-full pointer-events-none -z-10" />

            <motion.div 
              initial={{ opacity: 0, rotateY: -15, scale: 0.9 }} 
              whileInView={{ opacity: 1, rotateY: 0, scale: 1 }} 
              viewport={{ once: true, margin: "-100px" }} 
              transition={{ duration: 1, type: "spring", bounce: 0.4 }}
              className="relative w-full aspect-[9/16] rounded-[2.5rem] bg-white dark:bg-[#0a0c0c] border-[8px] border-white dark:border-[#222525] shadow-2xl dark:shadow-[0_40px_80px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col group will-change-transform"
            >
              {/* iPhone style top notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-6 bg-white dark:bg-[#222525] rounded-b-xl z-40" />

              {/* Playback Overlay (Shows when paused) */}
              <div className={`absolute inset-0 z-40 flex items-center justify-center backdrop-blur-sm transition-all duration-300 ${isPlaying ? 'opacity-0 bg-transparent pointer-events-none' : 'opacity-100 bg-black/30'}`}>
                <button 
                  onClick={() => setIsPlaying(true)}
                  className="w-16 h-16 rounded-full bg-white/90 dark:bg-black/80 backdrop-blur-md flex items-center justify-center text-[#2f6f57] dark:text-white shadow-[0_0_30px_rgba(47,111,87,0.3)] hover:scale-110 transition-transform focus:outline-none"
                >
                  <Play className="w-7 h-7 fill-current ml-1" />
                </button>
              </div>

              {/* Header Status Bar (Simulated UI) */}
              <div className="absolute top-0 left-0 right-0 z-30 p-5 pt-8 flex justify-between items-center pointer-events-none bg-gradient-to-b from-black/50 via-black/20 to-transparent">
                 <div className="flex items-center gap-2 bg-black/30 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-sm">
                   {DEMO_STEPS[currentStep].icon && (() => {
                     const Icon = DEMO_STEPS[currentStep].icon;
                     return <Icon className="w-3.5 h-3.5 text-white/90" />;
                   })()}
                   <span className="text-[10px] font-bold text-white tracking-widest uppercase">
                     {DEMO_STEPS[currentStep].title}
                   </span>
                 </div>
              </div>

              {/* Animation Layer */}
              <div className="flex-1 relative w-full h-full bg-gray-100 dark:bg-[#1a1d1d]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, scale: 1.02, filter: "blur(4px)" }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                    className="absolute inset-0 w-full h-full"
                  >
                    <CurrentComponent />
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Bottom Progress UI */}
              <div className="absolute bottom-0 left-0 w-full z-30 p-5 pt-12 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
                
                {/* Step Indicators */}
                <div className="flex gap-1 mb-4 h-[3px]">
                  {DEMO_STEPS.map((step, idx) => (
                    <div 
                      key={idx} 
                      className={`h-full rounded-full flex-1 overflow-hidden relative cursor-pointer ${idx <= currentStep ? 'bg-white/20' : 'bg-white/10 hover:bg-white/20'}`}
                      onClick={() => handleSeek(idx)}
                    >
                      {idx < currentStep && <div className="absolute inset-0 bg-[#10b981]" />}
                      {idx === currentStep && (
                        <div className="absolute top-0 left-0 bottom-0 bg-[#10b981] transition-all duration-75 ease-linear" style={{ width: `${stepProgress}%` }} />
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center text-[10px] font-mono font-bold text-white/90 uppercase tracking-widest">
                  <span className="opacity-80">{formatTime(elapsedMs)}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                       <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                       <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                    LIVE LOOP
                  </span>
                  <span className="opacity-50">1:00</span>
                </div>
              </div>
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
}
