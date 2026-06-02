import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  MapPin,
  Utensils,
  Truck,
  Building2,
  Lock,
  ArrowUpRight,
  Route,
  Activity,
  FileCheck2,
  Fingerprint,
  ArrowRight,
  X,
  Navigation,
  HeartHandshake,
  ScanFace,
  Loader2,
  PackagePlus,
  ClipboardList,
  UserCheck,
  QrCode,
  BadgeCheck,
  Users,
  Leaf
} from "lucide-react";
import { motion, useScroll, useTransform, AnimatePresence, useInView, useSpring, useMotionValue } from "motion/react";
import { useState, useRef, useEffect } from "react";
import { DemoSection } from "../components/DemoSection";
import { LiveSystemVisualization } from "../components/LiveSystemVisualization";
import { HeroRescueVisualization } from "../components/HeroRescueVisualization";
// ─── UTILITY COMPONENTS ──────────────────────────────────────────

function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const spring = useSpring(0, { mass: 1, stiffness: 45, damping: 25 });
  const display = useTransform(spring, (current) => Math.round(current).toLocaleString());

  useEffect(() => {
    if (isInView) spring.set(value);
  }, [isInView, spring, value]);

  return <motion.span ref={ref}>{display}</motion.span>;
}

const FLOW_STEPS = [
  {
    num: "01",
    icon: PackagePlus,
    title: "Listing",
    desc: "Donor lists surplus food with expiry time.",
    preview: "A restaurant or caterer opens the app and logs surplus food in under 30 seconds — quantity, type, and expiry time are captured and broadcast to the network instantly.",
    color: "#10b981",
  },
  {
    num: "02",
    icon: ClipboardList,
    title: "Request",
    desc: "Verified NGO claims food for their community.",
    preview: "An Aadhaar-verified NGO sees nearby listings in real time and submits a claim request. Their eligibility, capacity, and location are validated before the claim is confirmed.",
    color: "#3b82f6",
  },
  {
    num: "03",
    icon: UserCheck,
    title: "Assignment",
    desc: "Aadhaar-verified volunteer auto-assigned optimal route.",
    preview: "Our algorithm finds the nearest available verified volunteer and dispatches them with a route-optimized map. No manual coordination needed.",
    color: "#f59e0b",
  },
  {
    num: "04",
    icon: QrCode,
    title: "Pickup",
    desc: "QR-verified secure pickup from the donor.",
    preview: "The volunteer scans a unique QR code at the donor location. This cryptographically confirms the handoff and timestamps it to the immutable audit log.",
    color: "#8b5cf6",
  },
  {
    num: "05",
    icon: BadgeCheck,
    title: "Delivery",
    desc: "Confirmed handoff at the receiver location.",
    preview: "A second QR scan at the NGO confirms delivery. The full chain-of-custody record — donor → volunteer → receiver — is now logged, auditable, and complete.",
    color: "#2f6f57",
  },
];

function AnimatedProcessFlow() {
  const [activePreview, setActivePreview] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start 95%", "end 65%"] });
  const lineWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);
  // 5 nodes means 4 spaces. Node 0 at 0%, Node 1 at 25%, Node 2 at 50%, Node 3 at 75%, Node 4 at 100%
  const activeStep = useTransform(scrollYProgress, [0, 0.25, 0.5, 0.75, 1], [0, 1, 2, 3, 4]);
  const [currentActiveIndex, setCurrentActiveIndex] = useState(-1);

  useEffect(() => {
    const unsub = activeStep.on("change", (val) => {
      setCurrentActiveIndex(Math.floor(val));
    });
    return unsub;
  }, [activeStep]);

  // Close popup on scroll
  useEffect(() => {
    if (activePreview === null) return;
    
    const handleScroll = () => {
      setActivePreview(null);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activePreview]);

  return (
    <div ref={containerRef} className="relative">
      {/* Connecting track */}
      <div className="hidden md:block absolute top-[38px] left-[6%] right-[6%] h-[3px] bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
        <motion.div
          style={{ width: lineWidth }}
          className="absolute inset-0 h-full bg-gradient-to-r from-[#10b981] via-[#3b82f6] to-[#2f6f57] rounded-full shadow-[0_0_12px_#10b981]"
        />
      </div>

      {/* Steps */}
      <div className="relative flex flex-col md:flex-row justify-between items-start md:items-start w-full gap-8 md:gap-0">
        {FLOW_STEPS.map((s, i) => {
          const isActive = currentActiveIndex >= i;
          const isSelected = activePreview === i;
          const Icon = s.icon;
          return (
            <div key={i} className="flex-1 flex flex-col items-center text-center relative z-10">
              {/* Node */}
              <button
                onClick={() => setActivePreview(isSelected ? null : i)}
                className="focus:outline-none group mb-4 relative"
              >
                {/* Pulse ring on active */}
                {isActive && (
                  <span className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ backgroundColor: s.color }} />
                )}
                <motion.div
                  animate={{
                    backgroundColor: isActive ? s.color : "transparent",
                    borderColor: isActive ? s.color : "#e5e7eb",
                    scale: isSelected ? 1.15 : isActive ? 1.05 : 1,
                    boxShadow: isActive ? `0 0 24px ${s.color}55` : "none",
                  }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="w-16 h-16 md:w-[76px] md:h-[76px] rounded-full border-[3px] flex items-center justify-center dark:[--b:rgba(255,255,255,0.1)] relative z-10 bg-white dark:bg-[#0f1111]"
                  style={{ borderColor: isActive ? s.color : undefined }}
                >
                  <Icon
                    className="w-7 h-7 md:w-9 md:h-9 transition-colors duration-300"
                    style={{ color: isActive ? "white" : "#9ca3af" }}
                  />
                </motion.div>
                {/* Step number badge */}
                <span
                  className="absolute -top-1 -right-2 md:-right-1 text-[10px] md:text-xs font-black w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center z-20 transition-colors duration-300 shadow-md"
                  style={{
                    backgroundColor: isActive ? s.color : "#e5e7eb",
                    color: isActive ? "white" : "#9ca3af",
                  }}
                >
                  {i + 1}
                </span>
              </button>

              <motion.div
                animate={{ opacity: isActive ? 1 : 0.5, y: isActive ? 0 : 4 }}
                transition={{ duration: 0.4 }}
              >
                <h4 className="font-bold text-base md:text-lg text-gray-900 dark:text-white mb-1 md:mb-2">{s.title}</h4>
                <p className="text-xs md:text-sm text-gray-500 dark:text-white/50 leading-relaxed max-w-[140px] md:max-w-[180px] mx-auto">{s.desc}</p>
              </motion.div>

              {/* Mini Preview Card */}
              <AnimatePresence>
                {isSelected && (
                  <motion.div
                    key={`preview-${i}`}
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="absolute top-full mt-5 left-1/2 -translate-x-1/2 w-[280px] md:w-[340px] z-50"
                  >
                    <div
                      className="relative p-5 md:p-6 rounded-2xl border backdrop-blur-xl shadow-2xl text-left bg-white/95 dark:bg-[#0a0c0c]/95"
                      style={{
                        borderColor: `${s.color}40`,
                        boxShadow: `0 20px 40px -10px ${s.color}22`,
                      }}
                    >
                      {/* Close */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setActivePreview(null); }}
                        className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                      >
                        <X className="w-4 h-4 text-gray-400" />
                      </button>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 rounded-xl" style={{ backgroundColor: `${s.color}20` }}>
                          <Icon className="w-5 h-5 md:w-6 md:h-6" style={{ color: s.color }} />
                        </div>
                        <span className="text-sm md:text-base font-bold text-gray-900 dark:text-white">Step {i + 1} — {s.title}</span>
                      </div>
                      <p className="text-xs md:text-sm text-gray-600 dark:text-white/70 leading-relaxed">{s.preview}</p>
                    </div>
                    {/* Arrow */}
                    <div
                      className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rotate-45 border-l border-t rounded-tl-sm"
                      style={{ backgroundColor: `${s.color}12`, borderColor: `${s.color}40` }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnimatedKYCMockup() {
  const [step, setStep] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { margin: "-100px" });

  useEffect(() => {
    if (!isInView) return;

    // Sequence timing
    const sequence = [
      { step: 0, duration: 1500 }, // Aadhaar
      { step: 1, duration: 1500 }, // Biometric
      { step: 2, duration: 2500 }, // Scan
      { step: 3, duration: 2000 }, // Processing
      { step: 4, duration: 2500 }, // Success
    ];

    let timeoutId: NodeJS.Timeout;

    const runSequence = (currentStep: number) => {
      setStep(currentStep);
      const nextStep = (currentStep + 1) % sequence.length;
      timeoutId = setTimeout(() => {
        runSequence(nextStep);
      }, sequence[currentStep].duration);
    };

    runSequence(0);

    return () => clearTimeout(timeoutId);
  }, [isInView]);

  return (
    <div className="relative w-full max-w-sm mx-auto group">
      <div ref={ref} className="w-full aspect-[1/2] rounded-[2.5rem] border-[6px] border-white dark:border-[#171a1a] bg-gray-100 dark:bg-[#0a0c0c] shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden flex flex-col pt-10 px-6 pb-6 transition-transform duration-500 hover:-translate-y-2">
        <div className="h-4 w-40 bg-white dark:bg-[#171a1a] absolute top-0 left-1/2 -translate-x-1/2 rounded-b-xl z-20" />

        <h4 className="text-xl font-bold mb-2 text-gray-900 dark:text-white relative z-20">Identity Audit</h4>
        <p className="text-xs text-gray-600 dark:text-white/40 mb-6 relative z-20">Level-2 Clearance Protocol</p>

        <div className="flex-1 relative flex flex-col items-center justify-center min-h-[200px]">

          {/* Step 0 & 1: Cards */}
          <AnimatePresence mode="wait">
            {step <= 1 && (
              <motion.div
                key="cards"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, y: -20 }}
                className="w-full space-y-3 absolute inset-x-0"
              >
                <div className={`p-4 rounded-xl border transition-all duration-500 flex flex-col gap-3 ${step >= 0 ? 'border-[#2f6f57]/50 bg-[#2f6f57]/10' : 'border-gray-200 dark:border-white/5 opacity-50'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileCheck2 className={`w-4 h-4 ${step >= 0 ? 'text-[#2f6f57] dark:text-[#10b981]' : 'text-gray-400'}`} />
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">Aadhaar Verification</span>
                    </div>
                    {step > 0 ? <CheckCircle2 className="w-4 h-4 text-[#2f6f57] dark:text-[#10b981]" /> : <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-4 h-4 border-2 border-[#2f6f57] dark:border-[#10b981] border-t-transparent rounded-full" />}
                  </div>

                  {/* ID Card Graphic inside the mobile */}
                  <div className="relative w-full h-20 bg-white dark:bg-[#1a1d1d] rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden flex items-center px-3">
                    {step === 0 && (
                      <motion.div
                        animate={{ left: ["-20%", "120%", "-20%"] }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                        className="absolute top-0 bottom-0 w-12 bg-gradient-to-r from-transparent via-[#10b981]/40 to-transparent z-10"
                      />
                    )}
                    {/* Dummy Avatar */}
                    <div className="w-10 h-12 bg-gray-200 dark:bg-white/10 rounded mr-3 shrink-0 relative overflow-hidden">
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-6 bg-gray-300 dark:bg-white/20 rounded-t-full" />
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-gray-300 dark:bg-white/20 rounded-full" />
                    </div>
                    {/* Dummy Data Lines */}
                    <div className="flex-1 space-y-2">
                      <div className="h-1.5 bg-gray-200 dark:bg-white/10 rounded w-3/4" />
                      <div className="h-1.5 bg-gray-200 dark:bg-white/10 rounded w-1/2" />
                      <div className="h-1.5 bg-[#2f6f57]/30 dark:bg-[#10b981]/30 rounded w-full mt-2" />
                    </div>
                  </div>
                  {step === 0 && <span className="text-[10px] text-[#2f6f57] dark:text-[#10b981] font-medium text-center animate-pulse">Extracting UIDAI Data...</span>}
                </div>

                <div className={`p-4 rounded-xl border transition-all duration-500 flex items-center justify-between ${step >= 1 ? 'border-orange-500/50 bg-orange-500/10' : 'border-gray-200 dark:border-white/5 opacity-50'}`}>
                  <div className="flex items-center gap-3">
                    <Fingerprint className={`w-4 h-4 ${step >= 1 ? 'text-orange-500 animate-pulse' : 'text-gray-400'}`} />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">Biometric Selfie</span>
                  </div>
                  {step > 1 ? <CheckCircle2 className="w-4 h-4 text-orange-500" /> : (step === 1 && <span className="text-[10px] uppercase font-bold text-orange-500">Checking...</span>)}
                </div>
              </motion.div>
            )}

            {/* Step 2: Face Scan */}
            {step === 2 && (
              <motion.div
                key="scan"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                className="absolute w-48 h-48 rounded-full overflow-hidden border-4 border-[#2f6f57]/30 dark:border-[#10b981]/30 bg-gray-200 dark:bg-[#131616]"
              >
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80')] bg-cover bg-center opacity-40 mix-blend-luminosity" />
                <motion.div
                  animate={{ y: ["-10%", "110%", "-10%"] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-[#10b981]/40 to-[#10b981]/80 border-b-2 border-[#10b981]"
                />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#10b98115_1px,transparent_1px),linear-gradient(to_bottom,#10b98115_1px,transparent_1px)] bg-[size:10px_10px]" />
              </motion.div>
            )}

            {/* Step 3 & 4: Processing and Success */}
            {step >= 3 && (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center text-center w-full"
              >
                <div className="relative mb-6">
                  {step === 3 ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }} className="w-16 h-16 rounded-full border-4 border-gray-200 dark:border-white/10 border-t-[#2f6f57] dark:border-t-[#10b981]" />
                  ) : (
                    <motion.div
                      initial={{ scale: 0 }} animate={{ scale: 1 }}
                      className="w-16 h-16 rounded-full bg-[#2f6f57] dark:bg-[#10b981] flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.5)]"
                    >
                      <CheckCircle2 className="w-8 h-8 text-white" />
                    </motion.div>
                  )}
                </div>
                <h5 className="font-bold text-lg text-gray-900 dark:text-white mb-1">
                  {step === 3 ? 'Analyzing Data...' : 'Identity Verified'}
                </h5>
                <p className="text-xs text-gray-500 dark:text-white/50">
                  {step === 3 ? 'Cross-referencing government databases' : 'Clearance Level-2 Granted'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-auto relative z-20">
          {step < 4 ? (
            <div className="w-full h-12 bg-gray-200 dark:bg-white/5 rounded-xl overflow-hidden relative border border-transparent">
              <motion.div
                className="absolute top-0 left-0 h-full bg-[#2f6f57] dark:bg-[#10b981]"
                initial={{ width: "0%" }}
                animate={{ width: `${(step / 3) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-white/60 mix-blend-difference">
                Processing {Math.round((step / 3) * 100)}%
              </div>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Button className="w-full h-12 bg-[#2f6f57] hover:bg-[#235844] text-white dark:bg-[#10b981] dark:text-black dark:hover:bg-[#059669] font-bold shadow-lg shadow-[#10b981]/20 border-0 pointer-events-none">
                Verification Complete
              </Button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN HOME COMPONENT ────────────────────────────────────────

const ROLES = [
  { 
    id: 1, 
    title: "Donor", 
    icon: Utensils, 
    desc: "Caterers, restaurants, and event organizers can list surplus food instantly. We handle the logistics.", 
    href: "/donate", 
    extended: "Join 140+ active donors bridging the gap. Listing surplus takes under 30 seconds.", 
    spotlightColor: "rgba(16, 185, 129, 0.08)",
    colorBg: "from-[#10b981]/5 to-transparent",
    iconBg: "from-[#10b981] to-[#059669]"
  },
  { 
    id: 2, 
    title: "Receiver", 
    icon: Building2, 
    desc: "Verified NGOs, shelters, and community kitchens can claim nearby surplus food safely.", 
    href: "/requests", 
    extended: "Only fully verified non-profits handle high volume inputs. Ensure compliance and food safety.", 
    spotlightColor: "rgba(59, 130, 246, 0.08)",
    colorBg: "from-blue-500/5 to-transparent",
    iconBg: "from-blue-400 to-blue-600"
  },
  { 
    id: 3, 
    title: "Volunteer", 
    icon: Truck, 
    desc: "Deliver food using our optimized routing app. Real-time guidance and instant impact.", 
    href: "/logistics", 
    extended: "Turn your vehicle into a vector of change. High UI contrast layout ensures safe, focused navigation.", 
    spotlightColor: "rgba(249, 115, 22, 0.08)",
    colorBg: "from-orange-500/5 to-transparent",
    iconBg: "from-orange-400 to-orange-600"
  },
];

function InteractiveRoleCard({ role, index, onClick }: { role: any; index: number; onClick: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  // Map role ids to colors
  const themeColors = {
    1: { main: "#00e599", bg: "rgba(0, 229, 153, 0.08)", border: "rgba(0, 229, 153, 0.4)", shadow: "rgba(0, 229, 153, 0.2)" }, // Donor - Bright Green
    2: { main: "#3b82f6", bg: "rgba(59, 130, 246, 0.08)", border: "rgba(59, 130, 246, 0.4)", shadow: "rgba(59, 130, 246, 0.2)" }, // Receiver - Blue
    3: { main: "#ffaa00", bg: "rgba(255, 170, 0, 0.08)", border: "rgba(255, 170, 0, 0.4)", shadow: "rgba(255, 170, 0, 0.2)" }, // Volunteer - Orange/Yellow
  };
  const theme = themeColors[role.id as keyof typeof themeColors] || themeColors[1];

  return (
    <motion.div
      ref={cardRef}
      layoutId={`card-${role.id}`}
      custom={index}
      variants={{
        hidden: { opacity: 0, y: 30 },
        visible: (idx) => ({ opacity: 1, y: 0, transition: { delay: idx * 0.15, duration: 0.5, ease: "easeOut" } })
      }}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      className="group w-full relative flex flex-col p-8 rounded-[1.5rem] backdrop-blur-xl transition-all duration-500 text-left h-[340px] cursor-pointer overflow-hidden outline-none bg-[#030404] border"
      style={{
        borderColor: isHovered ? theme.main : theme.border,
        boxShadow: isHovered 
          ? `0 20px 40px -10px ${theme.shadow}, 0 0 20px ${theme.shadow} inset` 
          : `0 0 25px -5px ${theme.shadow}, 0 0 10px ${theme.bg} inset`,
      }}
    >
      {/* Background Dots Pattern */}
      <div className="absolute inset-0 z-0 opacity-40 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.07) 1px, transparent 0)', backgroundSize: '16px 16px', maskImage: 'linear-gradient(to bottom right, black 30%, transparent 80%)' }} />

      {/* Hover Spotlight Lighting Effect */}
      <div 
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-500"
        style={{
          opacity: isHovered ? 1 : 0.4,
          background: `radial-gradient(600px circle at ${isHovered ? mousePos.x : 200}px ${isHovered ? mousePos.y : 100}px, ${theme.bg}, transparent 40%)`
        }}
      />

      {/* Icon Upgrade */}
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-500 relative z-10 border" style={{ backgroundColor: `${theme.main}10`, borderColor: `${theme.main}30` }}>
         <role.icon className="w-6 h-6 relative z-10" style={{ color: theme.main }} />
      </div>
      
      {/* Typography Enhancement */}
      <div className="relative z-10 flex-1 flex flex-col">
        <h3 className="text-2xl font-bold text-white mb-3 transition-colors duration-300">{role.title}</h3>
        <p className="text-sm text-gray-400 leading-relaxed mb-6 transition-colors duration-300 group-hover:text-gray-300">{role.desc}</p>
        
        <div className="mt-auto flex items-center text-sm font-bold transition-colors duration-300" style={{ color: theme.main }}>
          Get Started 
          <span className="relative ml-3 flex items-center justify-center w-7 h-7 rounded-full border border-current overflow-hidden">
            <ArrowRight className="absolute w-3.5 h-3.5 -translate-x-5 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300 ease-out" />
            <ArrowRight className="absolute w-3.5 h-3.5 translate-x-0 opacity-100 group-hover:translate-x-5 group-hover:opacity-0 transition-all duration-300 ease-out" />
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export default function Home() {
  const [activeRole, setActiveRole] = useState<number | null>(null);

  // Parallax Refs
  const heroRef = useRef(null);
  const { scrollYProgress: heroScroll } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const textY = useTransform(heroScroll, [0, 1], ["0%", "50%"]);

  // Mouse Parallax Logic
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springConfig = { damping: 25, stiffness: 100 };
  const smoothMouseX = useSpring(mouseX, springConfig);
  const smoothMouseY = useSpring(mouseY, springConfig);

  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    mouseX.set((clientX / innerWidth) * 2 - 1);
    mouseY.set((clientY / innerHeight) * 2 - 1);
  };

  const bgParallaxX = useTransform(smoothMouseX, [-1, 1], [-20, 20]);
  const bgParallaxY = useTransform(smoothMouseY, [-1, 1], [-20, 20]);
  const bgParallaxXFast = useTransform(smoothMouseX, [-1, 1], [-40, 40]);
  const bgParallaxYFast = useTransform(smoothMouseY, [-1, 1], [-40, 40]);
  const floatX = useTransform(smoothMouseX, [-1, 1], [-80, 80]);
  const floatY = useTransform(smoothMouseY, [-1, 1], [-80, 80]);

  return (
    <div className="relative flex flex-col justify-start bg-background font-sans selection:bg-[#2f6f57] selection:text-white overflow-hidden text-gray-900 dark:text-white transition-colors duration-300 min-h-screen">

      {/* ─── NATIVE CSS ANIMATION BLOCK ─── */}
      <style>{`
        html, body {
          margin: 0;
          scroll-behavior: smooth;
          overflow-x: hidden;
          overflow-y: auto;
          touch-action: manipulation;
        }
        * {
          scrollbar-width: none;
        }
        *::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }
        @keyframes marquee { 0% { transform: translateX(0%); } 100% { transform: translateX(-50%); } }
        .css-marquee { display: flex; width: max-content; animation: marquee 40s linear infinite; }
        .css-marquee:hover { animation-play-state: paused; }
        @keyframes gradient { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        .animate-gradient { animation: gradient 4s linear infinite; }
      `}</style>

      {/* ────────────────── HERO SECTION (Parallax) ────────────────── */}
      <section
        ref={heroRef}
        onMouseMove={handleMouseMove}
        className="relative min-h-[85vh] flex flex-col items-center justify-center overflow-hidden pt-28 pb-16"
      >

        {/* SVG Noise Overlay */}
        <div className="hidden md:block absolute inset-0 z-0 opacity-[0.03] pointer-events-none mix-blend-overlay">
          <svg className="h-full w-full">
            <filter id="noise">
              <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" stitchTiles="stitch" />
            </filter>
            <rect width="100%" height="100%" filter="url(#noise)" />
          </svg>
        </div>


        {/* Subtle Background Elements */}
        <motion.div style={{ x: bgParallaxX, y: bgParallaxY }} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#2f6f57]/10 dark:bg-[#2f6f57]/15 blur-[120px] opacity-70 pointer-events-none rounded-full mix-blend-multiply dark:mix-blend-screen" />
        <motion.div style={{ x: bgParallaxXFast, y: bgParallaxYFast }} className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-500/5 dark:bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />
        <motion.div style={{ x: bgParallaxXFast, y: bgParallaxYFast }} className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-500/5 dark:bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />

        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

        <div className="max-w-4xl mx-auto px-6 relative z-10 w-full flex flex-col items-center text-center mt-10">

          <motion.div style={{ y: textY }} className="flex w-full flex-col items-center text-center z-20">

            {/* Status Pill */}
            <motion.div
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: "easeOut" }}
              className="mb-8"
            >
              <span className="inline-flex items-center rounded-full border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-[#171a1a]/80 backdrop-blur-md px-4 py-1.5 text-xs font-semibold text-gray-700 dark:text-white/80 tracking-wide shadow-sm dark:shadow-[0_0_20px_rgba(255,255,255,0.03)] cursor-default">
                <span className="relative flex h-2 w-2 mr-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10b981]"></span>
                </span>
                India Network Live
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial="hidden" animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
              className="text-5xl md:text-7xl lg:text-[5.5rem] font-black tracking-tight text-gray-900 dark:text-white leading-[1.05] mb-6 max-w-[900px] drop-shadow-sm dark:drop-shadow-none"
            >
              {["Surplus", "Food"].map((word, i) => (
                <motion.span
                  key={i}
                  variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } } }}
                  className="inline-block mr-4"
                >
                  {word}
                </motion.span>
              ))}
              <br />
              <motion.span
                variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } } }}
                className="inline-block bg-clip-text text-transparent bg-[length:200%_auto] bg-gradient-to-r from-[#2f6f57] via-[#10b981] to-[#2f6f57] dark:from-[#3abf8b] dark:via-[#10b981] dark:to-[#3abf8b] animate-gradient"
              >
                Real-Time Rescue
              </motion.span>
            </motion.h1>

            {/* Subtext */}
            <motion.p
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
              className="text-lg md:text-xl lg:text-2xl text-gray-600 dark:text-white/60 leading-relaxed max-w-2xl mb-12 font-medium"
            >
              Connect restaurants, caterers, volunteers, and verified NGOs to rescue surplus food before it expires.
            </motion.p>

            {/* Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
              className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto relative"
            >
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="relative group">
                <Button asChild size="lg" className="relative h-14 px-10 text-base font-bold bg-[#2f6f57] text-white hover:bg-[#235844] dark:bg-white dark:text-black dark:hover:bg-gray-200 transition-all rounded-full border-0 shadow-xl shadow-[#2f6f57]/20 dark:shadow-[0_0_40px_rgba(255,255,255,0.1)] hover:shadow-2xl hover:shadow-[#2f6f57]/40 overflow-hidden">
                  <Link to="/register">
                    <span className="relative z-10">Donate Food</span>
                    <span className="absolute inset-0 bg-white/20 group-hover:scale-x-100 scale-x-0 origin-left transition-transform duration-300 pointer-events-none" />
                  </Link>
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="relative">
                <Button asChild size="lg" className="relative h-14 px-10 text-base font-bold bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 dark:bg-[#131616] dark:text-white dark:border-white/10 dark:hover:border-white/30 dark:hover:bg-[#1a1d1d] transition-all rounded-full shadow-sm dark:shadow-none hover:shadow-lg overflow-hidden group">
                  <Link to="/browse">
                    <span className="relative z-10 flex items-center">Find Food <ArrowRight className="ml-2 w-4 h-4 opacity-70" /></span>
                    <span className="absolute inset-0 bg-gray-100 dark:bg-white/5 group-hover:scale-x-100 scale-x-0 origin-left transition-transform duration-300 pointer-events-none" />
                  </Link>
                </Button>
              </motion.div>
            </motion.div>

            {/* Trust Strip below buttons */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.6 }}
              className="mt-12 flex flex-wrap items-center justify-center gap-3 text-xs md:text-sm font-semibold text-gray-500 dark:text-white/40 tracking-wide"
            >
              <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-[#2f6f57]/70" /> Trusted by NGOs</span>
              <span className="opacity-30 mx-1">•</span>
              <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-[#2f6f57]/70" /> Verified Volunteers</span>
              <span className="opacity-30 mx-1">•</span>
              <span className="flex items-center gap-1.5"><Lock className="w-4 h-4 text-[#2f6f57]/70" /> QR Secure Delivery</span>
            </motion.div>

          </motion.div>
        </div>
      </section>

      {/* ────────────────── TRUST STRIP (Interactive) ────────────────── */}
      <LiveSystemVisualization />

      {/* ────────────────── DEMO SECTION ────────────────── */}
      <DemoSection />

      {/* ────────────────── TESTIMONIALS / LOGOS ────────────────── */}
      <section className="py-10 border-b border-gray-200 dark:border-white/5 bg-white dark:bg-[#171a1a]">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-[10px] tracking-widest uppercase font-bold text-gray-400 dark:text-white/30 mb-8">Trusted by verified NGOs & Foundations</p>
          <div className="flex flex-wrap justify-center items-center gap-10 md:gap-16 opacity-60 hover:opacity-100 transition-opacity duration-500 grayscale hover:grayscale-0">
            <div className="text-xl md:text-2xl font-black italic tracking-tighter text-gray-800 dark:text-gray-200">RobinHoodArmy</div>
            <div className="text-lg md:text-xl font-bold flex items-center gap-1.5 text-gray-800 dark:text-gray-200"><HeartHandshake className="w-5 h-5" /> AkshayaPatra</div>
            <div className="text-xl md:text-2xl font-serif font-bold text-gray-800 dark:text-gray-200">Zomato Feeding India</div>
            <div className="text-xl md:text-2xl font-bold tracking-[0.2em] text-gray-800 dark:text-gray-200 border-2 border-current px-2 py-0.5">GOONJ</div>
          </div>
        </div>
      </section>

      {/* ────────────────── WORKFLOW VISUALIZATION (Interactive Flow) ────────────────── */}
      <section className="py-12 md:py-16 bg-gray-50 dark:bg-[#0f1111] relative border-b border-gray-200 dark:border-white/5 transition-colors duration-300 overflow-visible">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
            className="text-center mb-12 md:mb-16"
          >
            <h2 className="text-xs md:text-sm uppercase tracking-[0.2em] font-bold text-gray-500 dark:text-white/40 mb-3">The Rescue Protocol</h2>
            <h3 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white">Closed-loop operations.</h3>
            <p className="text-sm md:text-base text-gray-500 dark:text-white/40 mt-4 font-medium">Scroll to activate each step — click any node to preview what happens.</p>
          </motion.div>

          <div className="pb-40 md:pb-16">
            <AnimatedProcessFlow />
          </div>
        </div>
      </section>

      {/* ────────────────── ROLE PATHWAYS (Modal Expansions) ────────────────── */}
      <section className="w-full py-24 flex flex-col items-center bg-[#020303] relative overflow-hidden transition-colors duration-300">
        {/* Cinematic Background Elements */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          {/* Radial dark green glow */}
          <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[1200px] h-[600px] bg-[#00e599]/10 blur-[150px] rounded-[100%]" />
          
          {/* Particles/Stars */}
          <div className="absolute top-1/4 left-[15%] w-1.5 h-1.5 rounded-full bg-[#00e599] shadow-[0_0_15px_2px_#00e599]" />
          <div className="absolute top-[35%] right-[12%] w-2 h-2 rounded-full bg-[#3b82f6] shadow-[0_0_20px_2px_#3b82f6]" />
          <div className="absolute bottom-[40%] left-[8%] w-1.5 h-1.5 rounded-full bg-[#34d399] shadow-[0_0_15px_2px_#34d399] opacity-80" />
          <div className="absolute bottom-1/4 right-[20%] w-1.5 h-1.5 rounded-full bg-[#ffaa00] shadow-[0_0_15px_2px_#ffaa00] opacity-90" />
          <div className="absolute top-[12%] right-[28%] w-1 h-1 rounded-full bg-white shadow-[0_0_10px_1px_white] opacity-60" />
          <div className="absolute bottom-[15%] left-[35%] w-2 h-2 rounded-full bg-[#00e599] shadow-[0_0_20px_3px_#00e599] opacity-40 blur-[1px]" />
        </div>

        <div className="max-w-6xl w-full px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: -20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
            className="mb-20 max-w-3xl text-center mx-auto flex flex-col items-center"
          >
            <span className="inline-flex items-center px-4 py-1.5 rounded-full border border-[#00e599]/40 bg-[#00e599]/10 text-[#00e599] text-[10px] md:text-xs font-extrabold tracking-widest uppercase mb-6 shadow-[0_0_20px_rgba(0,229,153,0.15)]">
              Be the reason someone eats today
            </span>
            <h2 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight mb-6 text-white drop-shadow-lg">
              Join the <span className="text-[#00e599] drop-shadow-[0_0_30px_rgba(0,229,153,0.4)]">Movement</span>
            </h2>
            <p className="text-center text-lg md:text-xl text-gray-400 font-medium">Choose your role and start creating impact today.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 place-items-center relative z-20">
            {ROLES.map((role, i) => (
              <div key={role.id} className="w-full">
                <InteractiveRoleCard role={role} index={i} onClick={() => setActiveRole(role.id)} />
              </div>
            ))}
          </div>

          {/* Trust Badges */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            {[
              { icon: ShieldCheck, title: "Safe & Secure", desc: "Your data is protected with enterprise-grade security.", color: "#00e599" },
              { icon: Users, title: "Trusted Community", desc: "Verified donors, NGOs, and volunteers across India.", color: "#3b82f6" },
              { icon: Leaf, title: "Real Impact", desc: "Track your contribution and see the difference you make.", color: "#ffaa00" }
            ].map((badge, idx) => (
              <div key={idx} className="flex items-center gap-5 p-5 rounded-2xl bg-[#080a0a]/90 border border-white/5 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                <div className="w-12 h-12 shrink-0 rounded-xl bg-[#111414] flex items-center justify-center border border-white/5 shadow-inner">
                  <badge.icon className="w-5 h-5" style={{ color: badge.color }} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">{badge.title}</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">{badge.desc}</p>
                </div>
              </div>
            ))}
          </motion.div>

          {/* Modal Expansions */}
          <AnimatePresence>
            {activeRole && (
              <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 md:p-8">
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => setActiveRole(null)}
                  className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-pointer"
                />

                {ROLES.filter(r => r.id === activeRole).map(role => {
                  // Map role ids to colors for modal as well
                  const themeColors = {
                    1: { main: "#00e599", bg: "rgba(0,229,153,0.15)", border: "rgba(0,229,153,0.4)" },
                    2: { main: "#3b82f6", bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.4)" },
                    3: { main: "#ffaa00", bg: "rgba(255,170,0,0.15)", border: "rgba(255,170,0,0.4)" },
                  };
                  const theme = themeColors[role.id as keyof typeof themeColors] || themeColors[1];

                  return (
                    <motion.div
                      layoutId={`card-${role.id}`}
                      key={role.id}
                      className="relative bg-[#050505] border border-white/10 p-8 md:p-12 rounded-[2rem] shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto flex flex-col z-[510] outline-none"
                    >
                      <button onClick={() => setActiveRole(null)} className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors outline-none"><X className="w-5 h-5" /></button>
                      <div className="w-16 h-16 rounded-2xl border flex items-center justify-center mb-8" style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
                        <role.icon className="w-8 h-8" style={{ color: theme.main }} />
                      </div>
                      <h3 className="text-3xl font-bold text-white mb-4">{role.title} Terminal</h3>
                      <p className="text-gray-400 leading-relaxed mb-8 text-lg">{role.extended}</p>

                      <div className="flex flex-col sm:flex-row gap-4 mt-auto">
                        <Button asChild className="h-12 flex-1 text-black font-bold active:scale-95 shadow-md border-0 hover:opacity-90 transition-opacity" style={{ backgroundColor: theme.main }}>
                          <Link to={role.href}>Enter Live Portal</Link>
                        </Button>
                        <Button variant="outline" className="h-12 flex-1 bg-transparent text-white border-white/20 hover:bg-white/5 active:scale-95" onClick={() => setActiveRole(null)}>
                          Close
                        </Button>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* ────────────────── VERIFICATION (KYC) ────────────────── */}
      <section className="py-20 relative bg-gray-50 dark:bg-[#0f1111] border-y border-gray-200 dark:border-white/5 overflow-hidden transition-colors duration-300">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">

          <motion.div
            initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
            className="order-2 lg:order-1"
          >
            <h2 className="text-4xl font-bold tracking-tight mb-6 text-gray-900 dark:text-white">Safety and Trust First.</h2>
            <p className="text-lg text-gray-600 dark:text-white/50 leading-relaxed mb-10">
              Every pickup and delivery is tracked safely. All volunteers undergo strict Aadhaar verification before handling food.
            </p>
            <ul className="space-y-6">
              {[
                { title: "Aadhaar Verification", body: "Automated OCR extraction against government datasets." },
                { title: "Real-Time Selfie Check", body: "Live face verification prior to route access." },
                { title: "Admin Moderation", body: "Suspicious profiles are quarantined pending human review." },
              ].map((item, i) => (
                <li key={i} className="flex flex-col gap-1 hover:pl-2 transition-all duration-300">
                  <div className="flex items-center gap-3 mb-1">
                    <ShieldCheck className="w-5 h-5 text-[#2f6f57]" />
                    <span className="font-bold text-gray-900 dark:text-white text-sm">{item.title}</span>
                  </div>
                  <span className="text-sm text-gray-600 dark:text-white/40 pl-8">{item.body}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
            className="order-1 lg:order-2"
          >
            <AnimatedKYCMockup />
          </motion.div>

        </div>
      </section>

      {/* ────────────────── IMPACT METRICS ────────────────── */}
      <section className="pt-20 pb-12 bg-white dark:bg-[#0a0c0c] border-b border-gray-200 dark:border-white/5">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 text-center">

            <div className="flex flex-col items-center justify-center">
              <div className="text-4xl md:text-5xl font-bold tracking-tighter mb-2 text-[#2f6f57]">
                <AnimatedNumber value={148} />
              </div>
              <div className="text-gray-500 dark:text-white/60 font-medium text-xs md:text-sm uppercase tracking-widest">Verified Donors</div>
            </div>

            <div className="flex flex-col items-center justify-center">
              <div className="text-4xl md:text-5xl font-bold tracking-tighter mb-2 text-[#2f6f57]">
                <AnimatedNumber value={42} />
              </div>
              <div className="text-gray-500 dark:text-white/60 font-medium text-xs md:text-sm uppercase tracking-widest">NGO Partners</div>
            </div>

            <div className="flex flex-col items-center justify-center">
              <div className="text-4xl md:text-5xl font-bold tracking-tighter mb-2 text-[#2f6f57]">
                <AnimatedNumber value={19} />
              </div>
              <div className="text-gray-500 dark:text-white/60 font-medium text-xs md:text-sm uppercase tracking-widest">Active Volunteers</div>
            </div>

            <div className="flex flex-col items-center justify-center">
              <div className="text-4xl md:text-5xl font-bold tracking-tighter mb-2 text-[#2f6f57]">
                <AnimatedNumber value={14} /><span className="text-2xl md:text-3xl text-gray-500 dark:text-white/40 ml-1 font-normal">min</span>
              </div>
              <div className="text-gray-500 dark:text-white/60 font-medium text-xs md:text-sm uppercase tracking-widest">Avg Response Time</div>
            </div>

          </div>
        </div>
      </section>

      {/* ────────────────── FINAL CTA ────────────────── */}
      <section className="bg-white dark:bg-[#0f1111] pt-20 pb-20 relative overflow-hidden text-center transition-colors duration-300">
        <div className="max-w-3xl mx-auto px-6 relative z-10">
          <motion.h2
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
            className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 dark:text-white mb-6"
          >
            Ready to make an impact?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }}
            className="text-lg text-gray-600 dark:text-white/50 mb-12 mx-auto leading-relaxed"
          >
            Join our network of food heroes across India to eliminate hunger and reduce waste. Whether you're donating or delivering, every action counts.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button asChild size="lg" className="h-14 px-10 text-sm font-bold bg-[#2f6f57] text-white hover:bg-[#235844] dark:bg-white dark:text-black dark:hover:bg-gray-200 transition-colors rounded-full border-0 shadow-lg dark:shadow-[0_0_40px_rgba(255,255,255,0.1)]">
                <Link to="/register">Donate Food</Link>
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button asChild size="lg" className="h-14 px-10 text-sm font-bold bg-white text-gray-900 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:bg-[#171a1a] dark:text-white dark:border-white/10 dark:hover:border-[#2f6f57] dark:hover:bg-[#111313] transition-colors rounded-full shadow-sm dark:shadow-none">
                <Link to="/browse">Explore Platform</Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
