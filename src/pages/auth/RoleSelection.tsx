import { Link } from "react-router-dom";
import { Utensils, HeartHandshake, Truck, ArrowRight, ShieldCheck, Sparkles, Users } from "lucide-react";
import { CinematicBackground } from "../../components/auth/CinematicBackground";

const roles = [
  {
    title: "Donor",
    description: "Donate surplus food from your restaurant, event, or business and help people in need.",
    icon: <Utensils className="h-6 w-6" />,
    link: "/register/donor",
    image: "/images/roles/donor.png",
    borderColor: "border-emerald-500/20",
    hoverBorder: "hover:border-emerald-400/60",
    hoverShadow: "hover:shadow-[0_8px_40px_-8px_rgba(16,185,129,0.35)]",
    iconBg: "bg-emerald-500/15 text-emerald-400",
    ctaColor: "text-emerald-400 group-hover:text-emerald-300",
    glowColor: "bg-emerald-400/15",
  },
  {
    title: "Receiver",
    description: "Register your NGO or shelter to receive food and support those who need it the most.",
    icon: <HeartHandshake className="h-6 w-6" />,
    link: "/register/receiver",
    image: "/images/roles/receiver.png",
    borderColor: "border-blue-500/20",
    hoverBorder: "hover:border-blue-400/60",
    hoverShadow: "hover:shadow-[0_8px_40px_-8px_rgba(59,130,246,0.35)]",
    iconBg: "bg-blue-500/15 text-blue-400",
    ctaColor: "text-blue-400 group-hover:text-blue-300",
    glowColor: "bg-blue-400/15",
  },
  {
    title: "Volunteer",
    description: "Help transport food from donors to receivers and be a real-life hero in your city.",
    icon: <Truck className="h-6 w-6" />,
    link: "/register/volunteer",
    image: "/images/roles/volunteer.png",
    borderColor: "border-amber-500/20",
    hoverBorder: "hover:border-amber-400/60",
    hoverShadow: "hover:shadow-[0_8px_40px_-8px_rgba(245,158,11,0.35)]",
    iconBg: "bg-amber-500/15 text-amber-400",
    ctaColor: "text-amber-400 group-hover:text-amber-300",
    glowColor: "bg-amber-400/15",
  },
];

const stats = [
  { icon: <Utensils className="h-5 w-5 text-emerald-400" />, value: "125K+", label: "Meals Rescued", sub: "This Month" },
  { icon: <Users className="h-5 w-5 text-blue-400" />, value: "1,250+", label: "Active NGOs", sub: "Across India" },
  { icon: <HeartHandshake className="h-5 w-5 text-rose-400" />, value: "8,500+", label: "Volunteers", sub: "Making Impact" },
];

export default function RoleSelection() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#050a0a] text-zinc-50 font-sans selection:bg-emerald-500/30">
      <CinematicBackground />

      {/* ── Main Content ── */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-10 lg:py-0">

        {/* ── Split Layout: Hero Left + Cards Right ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-10 lg:gap-20 items-center min-h-screen">

          {/* ── LEFT: Hero Section ── */}
          <div className="flex flex-col justify-center py-10 lg:py-0">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold tracking-wider uppercase mb-8 w-fit backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5" />
              India's Real-Time Food Rescue Network
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] xl:text-6xl font-extrabold tracking-tight leading-[1.08] mb-6">
              <span className="text-white">Feed People.</span>
              <br />
              <span className="text-white">Not </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-emerald-300 to-teal-300">Landfills.</span>
            </h1>

            {/* Decorative accent */}
            <div className="flex items-center gap-1.5 mb-7">
              <div className="w-10 h-1 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"></div>
              <div className="w-2 h-1 rounded-full bg-emerald-500/40"></div>
              <div className="w-1 h-1 rounded-full bg-emerald-500/20"></div>
            </div>

            {/* Subtext */}
            <p className="text-zinc-400 text-base sm:text-lg leading-relaxed max-w-[26rem] mb-10">
              Join a trusted community of donors, NGOs, and volunteers working together to rescue surplus food and make a real impact in people's lives.
            </p>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="bg-zinc-900/50 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-4 text-center transition-all duration-300 hover:border-white/10 hover:bg-zinc-800/40 group/stat"
                >
                  <div className="flex items-center justify-center mb-2.5">
                    <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.04] flex items-center justify-center group-hover/stat:bg-white/[0.06] transition-colors">
                      {stat.icon}
                    </div>
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-none">{stat.value}</div>
                  <div className="text-[11px] text-zinc-400 font-medium mt-1.5">{stat.label}</div>
                  <div className="text-[10px] text-emerald-500/70 font-medium mt-0.5 italic">{stat.sub}</div>
                </div>
              ))}
            </div>

            {/* Trust Strip */}
            <div className="flex items-center gap-3.5 bg-zinc-900/40 backdrop-blur-sm border border-white/[0.06] rounded-2xl px-5 py-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white leading-tight">Safe. Verified. Transparent.</p>
                <p className="text-xs text-zinc-500 mt-0.5">All users are verified to ensure trust and safety.</p>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Role Cards ── */}
          <div className="flex flex-col justify-center py-10 lg:py-0">
            {/* Section Header */}
            <div className="mb-7">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2 flex items-center gap-2.5">
                Join the Movement
                <Sparkles className="h-5 w-5 text-emerald-400 opacity-80" />
              </h2>
              <p className="text-zinc-400 text-[15px]">Choose your role and start creating change today.</p>
            </div>

            {/* Role Cards - Donor & Receiver side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {roles.slice(0, 2).map((role) => (
                <Link
                  key={role.title}
                  to={role.link}
                  className={`group relative overflow-hidden rounded-2xl border ${role.borderColor} ${role.hoverBorder} ${role.hoverShadow} bg-zinc-900/40 backdrop-blur-md p-6 pb-8 transition-all duration-500 ease-out hover:-translate-y-1.5 hover:scale-[1.02] min-h-[240px]`}
                >
                  {/* Ambient corner glow */}
                  <div className={`absolute -bottom-10 -right-10 w-36 h-36 ${role.glowColor} rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-700`}></div>
                  {/* Top reflection line */}
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent"></div>

                  <div className="relative z-10">
                    {/* Icon */}
                    <div className={`w-12 h-12 rounded-xl ${role.iconBg} border border-white/[0.04] flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110`}>
                      {role.icon}
                    </div>

                    {/* Title */}
                    <h3 className="text-xl font-bold text-white mb-2 transition-colors">{role.title}</h3>

                    {/* Description */}
                    <p className="text-[13px] text-zinc-400 leading-relaxed mb-5 pr-16">{role.description}</p>

                    {/* CTA */}
                    <div className={`inline-flex items-center gap-2 text-sm font-semibold ${role.ctaColor} transition-all duration-300`}>
                      Get Started
                      <div className="w-6 h-6 rounded-full border border-current/30 flex items-center justify-center group-hover:bg-current/10 transition-all duration-300">
                        <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform duration-300" />
                      </div>
                    </div>
                  </div>

                  {/* 3D Illustration */}
                  <div className="absolute -bottom-1 -right-1 w-[7rem] h-[7rem] sm:w-[8rem] sm:h-[8rem] opacity-75 group-hover:opacity-100 group-hover:scale-110 group-hover:-translate-y-1 transition-all duration-500 ease-out pointer-events-none">
                    <img src={role.image} alt={role.title} className="w-full h-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]" />
                  </div>
                </Link>
              ))}
            </div>

            {/* Volunteer Card - Full Width */}
            {(() => {
              const role = roles[2];
              return (
                <Link
                  to={role.link}
                  className={`group relative overflow-hidden rounded-2xl border ${role.borderColor} ${role.hoverBorder} ${role.hoverShadow} bg-zinc-900/40 backdrop-blur-md p-6 transition-all duration-500 ease-out hover:-translate-y-1.5 hover:scale-[1.01] mb-5`}
                >
                  {/* Ambient corner glow */}
                  <div className={`absolute -bottom-10 -right-10 w-44 h-44 ${role.glowColor} rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-700`}></div>
                  {/* Top reflection line */}
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent"></div>

                  <div className="relative z-10 flex items-center gap-5">
                    {/* Icon */}
                    <div className={`w-12 h-12 rounded-xl ${role.iconBg} border border-white/[0.04] flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110`}>
                      {role.icon}
                    </div>

                    <div className="flex-1 min-w-0 pr-28 sm:pr-36">
                      <h3 className="text-xl font-bold text-white mb-1 transition-colors">{role.title}</h3>
                      <p className="text-[13px] text-zinc-400 leading-relaxed">{role.description}</p>
                      <div className={`inline-flex items-center gap-2 text-sm font-semibold mt-3 ${role.ctaColor} transition-all duration-300`}>
                        Get Started
                        <div className="w-6 h-6 rounded-full border border-current/30 flex items-center justify-center group-hover:bg-current/10 transition-all duration-300">
                          <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform duration-300" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3D Illustration */}
                  <div className="absolute -bottom-2 right-2 w-[7.5rem] h-[7.5rem] sm:w-[9rem] sm:h-[9rem] opacity-75 group-hover:opacity-100 group-hover:scale-110 group-hover:-translate-y-1 transition-all duration-500 ease-out pointer-events-none">
                    <img src={role.image} alt={role.title} className="w-full h-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]" />
                  </div>
                </Link>
              );
            })()}

            {/* Bottom Mission Strip */}
            <div className="flex items-center gap-3.5 bg-zinc-900/40 backdrop-blur-sm border border-white/[0.06] rounded-2xl px-5 py-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <HeartHandshake className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white leading-tight">Together, we can build a hunger-free and waste-free India.</p>
                <p className="text-xs text-emerald-500/70 italic mt-0.5">Be the reason someone smiles today.</p>
              </div>
            </div>

            {/* Sign In Link */}
            <div className="mt-6 text-center lg:text-left">
              <p className="text-sm text-zinc-500">
                Already have an account?{" "}
                <Link to="/auth/login" className="font-medium text-emerald-400 hover:text-emerald-300 transition-colors">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
