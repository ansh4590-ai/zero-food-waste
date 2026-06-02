import { motion } from "motion/react";
import { useState, useEffect } from "react";
import { CheckCircle2, ShieldCheck, Building2, Truck, QrCode, Package } from "lucide-react";

const HERO_NODES = [
  { label: "Food Uploaded", time: "12:30 PM", icon: Package, delay: 0 },
  { label: "AI Verified", time: "12:32 PM", icon: ShieldCheck, delay: 0.15 },
  { label: "NGO Matched", time: "12:33 PM", icon: Building2, delay: 0.3 },
  { label: "Volunteer Assigned", time: "12:35 PM", icon: Truck, delay: 0.45 },
  { label: "Pickup (QR)", time: "12:40 PM", icon: QrCode, delay: 0.6 },
  { label: "Delivered", time: "01:05 PM", icon: CheckCircle2, delay: 0.75 },
];

export function HeroRescueVisualization() {
  const [pulseIndex, setPulseIndex] = useState(0);
  const [mealsCount, setMealsCount] = useState(8392);

  useEffect(() => {
    const interval = setInterval(() => {
      setPulseIndex((prev) => (prev >= HERO_NODES.length - 1 ? 0 : prev + 1));
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Increment meals counter slowly
  useEffect(() => {
    const interval = setInterval(() => {
      setMealsCount((prev) => prev + Math.floor(Math.random() * 3));
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-full min-h-[500px] lg:min-h-[600px] flex items-center justify-center">
      {/* Background globe gradient */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.08)_0%,transparent_70%)]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-[#10b981]/[0.06]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full border border-[#10b981]/[0.04]" />
      </div>

      {/* Floating particles */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-[#10b981]/40"
          style={{
            top: `${15 + Math.random() * 70}%`,
            left: `${10 + Math.random() * 80}%`,
          }}
          animate={{
            y: [0, -15, 0],
            opacity: [0.2, 0.6, 0.2],
          }}
          transition={{
            repeat: Infinity,
            duration: 3 + Math.random() * 3,
            delay: Math.random() * 2,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Central Impact Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className="absolute top-[8%] left-1/2 -translate-x-1/2 z-30"
      >
        <div className="bg-[#111414]/90 backdrop-blur-xl border border-[#10b981]/20 rounded-2xl px-5 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(16,185,129,0.1)]">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse shadow-[0_0_6px_#10b981]" />
            <span className="text-[10px] font-semibold text-[#10b981] uppercase tracking-widest">
              Live Impact
            </span>
          </div>
          <div className="text-3xl font-bold text-white tracking-tight">
            {mealsCount.toLocaleString()}
          </div>
          <div className="text-[11px] text-white/40 font-medium">
            Meals Rescued
          </div>
          <div className="text-[10px] text-white/25 mt-0.5">Today</div>
        </div>
      </motion.div>

      {/* Flow Path - SVG connecting line */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        viewBox="0 0 600 500"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="heroPathGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.2" />
          </linearGradient>
          <filter id="heroGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Main connecting path */}
        <path
          d="M 60 180 C 120 200, 140 280, 180 300 S 260 350, 300 320 S 380 260, 420 280 S 480 340, 520 320 L 560 340"
          fill="none"
          stroke="url(#heroPathGrad)"
          strokeWidth="2"
          strokeDasharray="6 4"
          filter="url(#heroGlow)"
        />

        {/* Pulse dot traveling along the path */}
        <circle r="4" fill="#10b981" filter="url(#heroGlow)">
          <animateMotion
            dur="8s"
            repeatCount="indefinite"
            path="M 60 180 C 120 200, 140 280, 180 300 S 260 350, 300 320 S 380 260, 420 280 S 480 340, 520 320 L 560 340"
          />
        </circle>

        {/* Node dots on the path */}
        {[
          [60, 180],
          [180, 300],
          [300, 320],
          [420, 280],
          [520, 320],
          [560, 340],
        ].map(([cx, cy], i) => (
          <g key={i}>
            <circle
              cx={cx}
              cy={cy}
              r="5"
              fill={pulseIndex >= i ? "#10b981" : "#1a1d1d"}
              stroke={pulseIndex >= i ? "#10b981" : "#ffffff10"}
              strokeWidth="1.5"
            />
            {pulseIndex === i && (
              <circle cx={cx} cy={cy} r="5" fill="none" stroke="#10b981" strokeWidth="1">
                <animate attributeName="r" from="5" to="16" dur="1.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" />
              </circle>
            )}
          </g>
        ))}
      </svg>

      {/* Floating Node Cards */}
      {HERO_NODES.map((node, i) => {
        const isActive = pulseIndex === i;
        const isPast = pulseIndex > i;
        const Icon = node.icon;

        // Position each card along a curved path
        const positions = [
          { top: "30%", left: "2%" },
          { top: "48%", left: "12%" },
          { top: "52%", left: "30%" },
          { top: "42%", left: "50%" },
          { top: "52%", left: "68%" },
          { top: "56%", left: "82%" },
        ];

        return (
          <motion.div
            key={node.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{
              opacity: 1,
              y: isActive ? -4 : 0,
              scale: isActive ? 1.05 : 1,
            }}
            transition={{ duration: 0.5, delay: node.delay }}
            className="absolute z-20"
            style={positions[i]}
          >
            <div
              className="relative bg-[#111414]/80 backdrop-blur-xl rounded-xl px-3 py-2.5 border transition-all duration-400 min-w-[110px]"
              style={{
                borderColor: isActive
                  ? "rgba(16,185,129,0.5)"
                  : isPast
                    ? "rgba(16,185,129,0.15)"
                    : "rgba(255,255,255,0.06)",
                boxShadow: isActive
                  ? "0 8px 24px rgba(0,0,0,0.5), 0 0 20px rgba(16,185,129,0.1)"
                  : "0 4px 12px rgba(0,0,0,0.3)",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors duration-300"
                  style={{
                    backgroundColor: isActive || isPast ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.05)",
                  }}
                >
                  <Icon
                    className="w-3.5 h-3.5"
                    style={{
                      color: isActive || isPast ? "#10b981" : "rgba(255,255,255,0.3)",
                    }}
                  />
                </div>
                {(isActive || isPast) && (
                  <CheckCircle2 className="w-3 h-3 text-[#10b981]" />
                )}
              </div>
              <p className="text-[11px] font-semibold text-white/90 leading-tight">
                {node.label}
              </p>
              <p className="text-[9px] text-[#10b981]/60 font-medium mt-0.5">
                {node.time}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
