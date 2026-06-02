import { motion } from "motion/react";
import { useState, useEffect } from "react";
import { Activity, CheckCircle2, Clock } from "lucide-react";

// --- CUSTOM PREMIUM 3D-STYLE SVGS ---
const CustomIcons = {
  Upload: (props: any) => (
    <img
      src="https://em-content.zobj.net/source/apple/354/pot-of-food_1f372.png"
      alt="Food Upload"
      className="w-[120%] h-[120%] object-contain scale-110"
      style={{ ...props.style, filter: props.style?.filter ? props.style.filter.replace('grayscale(100%)', 'grayscale(100%) opacity(0.6)') : 'none' }}
    />
  ),
  AICheck: (props: any) => (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <defs>
        <linearGradient id="gradAI" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
        <linearGradient id="gradAIShine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M12 21.5s8-4.5 8-10.5V5.5L12 2.5l-8 3v6c0 6 8 10.5 8 10.5z" fill="url(#gradAI)" stroke="#064e3b" strokeWidth="0.5" />
      <path d="M12 21.5s8-4.5 8-10.5V5.5L12 2.5l-8 3v6c0 6 8 10.5 8 10.5z" fill="url(#gradAIShine)" />
      <path d="M9 11.5l2 2 4-4" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  NGO: (props: any) => (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <defs>
        <linearGradient id="gradNGO" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      {/* Background people */}
      <circle cx="6" cy="9" r="3.5" fill="url(#gradNGO)" opacity="0.7" />
      <path d="M2 20v-1a3.5 3.5 0 0 1 3.5-3.5h1" stroke="url(#gradNGO)" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
      <circle cx="18" cy="9" r="3.5" fill="url(#gradNGO)" opacity="0.7" />
      <path d="M22 20v-1a3.5 3.5 0 0 0-3.5-3.5h-1" stroke="url(#gradNGO)" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
      {/* Foreground person */}
      <circle cx="12" cy="7" r="4.5" fill="url(#gradNGO)" />
      <path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" fill="url(#gradNGO)" />
    </svg>
  ),
  Volunteer: (props: any) => (
    <img
      src="/images/volunteer_icon.png"
      alt="Volunteer"
      className="w-[120%] h-[120%] object-contain scale-110"
      style={{ 
        ...props.style,
        filter: props.style?.filter ? props.style.filter.replace('grayscale(100%)', 'grayscale(100%) opacity(0.6)') : 'none'
      }}
    />
  ),
  Pickup: (props: any) => (
    <img
      src="/images/qr_icon.png"
      alt="QR Pickup"
      className="w-[120%] h-[120%] object-contain scale-110"
      style={{
        ...props.style,
        filter: props.style?.filter ? props.style.filter.replace('grayscale(100%)', 'grayscale(100%) opacity(0.6)') : 'none'
      }}
    />
  ),
  Delivery: (props: any) => (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <defs>
        <linearGradient id="gradBoxTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id="gradBoxLeft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
        <linearGradient id="gradBoxRight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      {/* Top Face */}
      <path d="M12 3L21 8L12 13L3 8L12 3Z" fill="url(#gradBoxTop)" />
      {/* Left Face */}
      <path d="M3 8v9.5l9 5.5v-10L3 8Z" fill="url(#gradBoxLeft)" />
      {/* Right Face */}
      <path d="M21 8v9.5l-9 5.5v-10l9-5.5Z" fill="url(#gradBoxRight)" />
      {/* Tape Lines */}
      <path d="M12 3v10M3 8l9 5l9-5" stroke="#fcd34d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </svg>
  )
};

// Premium Multi-Tone Color System mapping to the custom icons
const NODES = [
  { id: "upload", label: "Food Upload", icon: CustomIcons.Upload, color: "#10b981" },
  { id: "ai", label: "AI Check", icon: CustomIcons.AICheck, color: "#10b981" },
  { id: "ngo", label: "NGO Request", icon: CustomIcons.NGO, color: "#a855f7" }, // Purple
  { id: "volunteer", label: "Volunteer", icon: CustomIcons.Volunteer, color: "#10b981" },
  { id: "pickup", label: "QR Pickup", icon: CustomIcons.Pickup, color: "#14b8a6" }, // Teal
  { id: "delivery", label: "Delivered", icon: CustomIcons.Delivery, color: "#f59e0b" }, // Warm Orange
];

export function LiveSystemVisualization() {
  const [activeNode, setActiveNode] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveNode((prev) => (prev >= NODES.length - 1 ? 0 : prev + 1));
    }, 1100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 relative cursor-default z-10 my-8">
      <style>{`
        @keyframes pulseMove {
          0% { transform: translateX(-100%); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateX(200%); opacity: 0; }
        }
        .animate-pulseMove {
          animation: pulseMove 2.5s linear infinite;
        }
        @keyframes arrowSlide {
          0% { transform: translateX(-4px); opacity: 0.3; }
          50% { opacity: 1; transform: translateX(0px); }
          100% { transform: translateX(4px); opacity: 0.3; }
        }
        .animate-arrowSlide {
          animation: arrowSlide 2s ease-in-out infinite;
        }
      `}</style>

      <div className="w-full bg-[#0a0c0c]/90 backdrop-blur-2xl border border-white/5 rounded-[2rem] py-8 px-6 lg:px-8 relative overflow-hidden shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)]">

        {/* Soft Ambient Glow Behind Center Steps */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[80%] bg-[#10b981]/10 blur-[80px] pointer-events-none rounded-full" />

        <div className="relative flex flex-col xl:flex-row items-center justify-between gap-8 xl:gap-6">

          {/* 1. Left Info Block */}
          <div className="shrink-0 text-center xl:text-left flex flex-col justify-center">
            <div className="flex items-center gap-2 justify-center xl:justify-start mb-1.5">
              <Activity className="w-4 h-4 text-[#10b981]" />
              <span className="text-[15px] font-bold text-white tracking-tight">
                Real-Time Rescue Flow
              </span>
            </div>
            <p className="text-[11px] text-white/40 leading-relaxed font-medium">
              Every step happens in minutes, <br className="hidden xl:block" />saving food and bringing hope.
            </p>
          </div>

          {/* 2 & 3. Flow Container & Connector System */}
          <div className="flex-1 w-full flex items-start justify-between relative mt-4 xl:mt-0 px-2 lg:px-6">

            {/* GLOBAL BASE LINE (creates the pipeline backbone) */}
            <div className="absolute left-[40px] right-[30px] md:left-[90px] md:right-[100px] top-[28px] md:top-[36px] -translate-y-1/2 h-[3px] shadow-[0_0_12px_#10b981] bg-gradient-to-r from-transparent via-[#10b981]/30 to-transparent blur-[1px] pointer-events-none" />

            {NODES.map((node, i) => {
              const isActive = activeNode === i;
              const isPast = activeNode > i;
              const Icon = node.icon;

              return (
                <div key={node.id} className="flex items-start relative z-10 w-full">
                  {/* Card Block */}
                  <div className="flex flex-col items-center gap-4 relative shrink-0">
                    <motion.div
                      animate={{
                        y: isActive ? -4 : 0,
                        borderColor: isActive ? `${node.color}50` : isPast ? `${node.color}30` : "rgba(255,255,255,0.06)",
                        backgroundColor: isActive ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
                        boxShadow: isActive
                          ? `inset 0 0 10px ${node.color}20, 0 0 25px ${node.color}40`
                          : "inset 0 0 6px rgba(255,255,255,0.02)",
                        scale: isActive ? 1.08 : 1,
                      }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="w-14 h-14 md:w-[72px] md:h-[72px] rounded-[16px] md:rounded-[20px] border backdrop-blur-[20px] flex items-center justify-center relative z-10 overflow-hidden"
                    >
                      {/* Inner Radial Glow Background (adds lighting contrast to icon) */}
                      {(isActive || isPast) && (
                        <div
                          className="absolute inset-0 z-0 opacity-50"
                          style={{ background: `radial-gradient(circle at 30% 30%, ${node.color}40, transparent 70%)` }}
                        />
                      )}

                      {/* Custom SVGs with 3D-like behavior */}
                      <div className="relative z-20 flex items-center justify-center w-8 h-8 md:w-10 md:h-10 transition-all duration-500"
                        style={{
                          opacity: isActive || isPast ? 1 : 0.4,
                          filter: isActive || isPast ? `drop-shadow(0 2px 6px rgba(0,0,0,0.4))` : "grayscale(100%)",
                          transform: isActive ? "scale(1.1)" : "scale(1)"
                        }}>
                        <Icon className="w-full h-full" />
                      </div>

                      {/* Completed State Tick */}
                      {isPast && (
                        <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 md:w-6 md:h-6 bg-[#10b981] rounded-full flex items-center justify-center shadow-lg border-2 border-[#0a0c0c] z-30">
                          <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5 text-[#0a0c0c]" strokeWidth={3} />
                        </div>
                      )}
                    </motion.div>

                    {/* Label */}
                    <span
                      className="text-[9px] md:text-[11px] font-bold tracking-wider text-center leading-tight whitespace-nowrap hidden sm:block uppercase"
                      style={{ color: isActive || isPast ? "#ffffff" : "rgba(255,255,255,0.6)" }}
                    >
                      {node.label}
                    </span>
                  </div>

                  {/* Connector Line System */}
                  {i < NODES.length - 1 && (
                    <div className="flex-1 h-14 md:h-[72px] flex items-center justify-center relative">
                      {/* Base Line (Gradient) */}
                      <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#10b981]/20 to-transparent" />

                      {/* Small glowing node in the middle */}
                      <div className="absolute w-1.5 h-1.5 rounded-full bg-[#10b981]/40 shadow-[0_0_8px_#10b981]" style={{ opacity: isPast || isActive ? 1 : 0.2 }} />

                      {/* Arrow Indicator with Slide Animation */}
                      <div className="absolute z-10 flex items-center justify-center" style={{ opacity: isPast || isActive ? 1 : 0.2 }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-[#10b981] animate-arrowSlide drop-shadow-[0_0_6px_rgba(16,185,129,0.8)]">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </div>

                      {/* Moving pulse */}
                      {(isActive || isPast) && (
                        <div className="absolute inset-x-0 h-[3px] overflow-hidden pointer-events-none">
                          <div className="w-[40%] h-full bg-gradient-to-r from-transparent via-[#10b981] to-transparent animate-pulseMove opacity-100 blur-[1px]" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 4. Right Metric */}
          <div className="shrink-0 text-center xl:text-right flex flex-col justify-center xl:border-l border-white/5 pt-6 xl:pt-0 xl:pl-8 mt-2 xl:mt-0">
            <div className="flex items-center gap-1.5 justify-center xl:justify-end mb-1">
              <Clock className="w-3.5 h-3.5 text-[#10b981]/50" />
              <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">
                Avg. Delivery Time
              </span>
            </div>
            <div className="text-2xl md:text-3xl font-black text-white tracking-tight drop-shadow-sm">
              28 <span className="text-sm font-semibold text-white/40">mins</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}