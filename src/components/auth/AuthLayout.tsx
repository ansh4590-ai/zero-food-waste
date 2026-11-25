import React from "react";
import { Link } from "react-router-dom";
import { Utensils, Users, HeartHandshake, ShieldCheck, Sparkles, Leaf, Heart } from "lucide-react";
import { CinematicBackground } from "./CinematicBackground";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  illustrationText?: string;
  /** If true, hides the left mission panel (for pages like RoleSelection that handle their own layout) */
  fullWidth?: boolean;
}

const stats = [
  { icon: <Utensils className="h-5 w-5 text-success" />, value: "125K+", label: "Meals Rescued", sub: "This Month" },
  { icon: <Users className="h-5 w-5 text-info" />, value: "1,250+", label: "Active NGOs", sub: "Across India" },
  { icon: <HeartHandshake className="h-5 w-5 text-destructive" />, value: "8,500+", label: "Volunteers", sub: "Making Impact" },
];

const trustItems = [
  { icon: <ShieldCheck className="h-5 w-5 text-success" />, title: "Safe & Secure", desc: "Your data is protected with enterprise-grade security." },
  { icon: <Users className="h-5 w-5 text-success" />, title: "Trusted Community", desc: "Verified donors, NGOs, and volunteers across India." },
  { icon: <Leaf className="h-5 w-5 text-success" />, title: "Real Impact", desc: "Track your contribution and see the difference you make." },
];

export function AuthLayout({ children, title, subtitle, fullWidth = false }: AuthLayoutProps) {
  if (fullWidth) {
    return (
      <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground font-sans selection:bg-emerald-500/30">
        <CinematicBackground />
        <div className="relative z-10 w-full">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground font-sans selection:bg-emerald-500/30">
      <CinematicBackground />

      {/* ── Main Content ── */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-8 lg:px-12">

        {/* ── Split Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-8 lg:gap-16 items-center min-h-screen py-10 lg:py-0">

          {/* ── LEFT: Mission Panel ── */}
          <div className="hidden lg:flex flex-col justify-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-success text-xs font-semibold tracking-wider uppercase mb-8 w-fit backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5" />
              India's Real-Time Food Rescue Network
            </div>

            {/* Headline */}
            <h1 className="text-4xl xl:text-[3.25rem] font-extrabold tracking-tight leading-[1.1] mb-6">
              <span className="text-foreground">Feed People.</span>
              <br />
              <span className="text-foreground">Not </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-success to-info">Landfills.</span>
            </h1>

            {/* Decorative accent */}
            <div className="flex items-center gap-1.5 mb-7">
              <div className="w-10 h-1 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"></div>
              <div className="w-2 h-1 rounded-full bg-emerald-500/40"></div>
              <div className="w-1 h-1 rounded-full bg-emerald-500/20"></div>
            </div>

            {/* Description */}
            <p className="text-muted-foreground text-base leading-relaxed max-w-[24rem] mb-10">
              Join a trusted community of donors, NGOs, and volunteers working together to rescue surplus food and make a real impact in people's lives.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="bg-card backdrop-blur-sm border border-border rounded-2xl p-4 text-center transition-all duration-300 hover:border-emerald-500/20 hover:bg-card"
                >
                  <div className="flex items-center justify-center mb-2">
                    <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
                      {stat.icon}
                    </div>
                  </div>
                  <div className="text-xl font-bold text-foreground tracking-tight leading-none">{stat.value}</div>
                  <div className="text-[11px] text-muted-foreground font-medium mt-1.5">{stat.label}</div>
                  <div className="text-[10px] text-success font-medium mt-0.5 italic">{stat.sub}</div>
                </div>
              ))}
            </div>

            {/* Trust strip */}
            <div className="grid grid-cols-3 gap-2.5">
              {trustItems.map((item) => (
                <div key={item.title} className="flex flex-col items-center text-center bg-card border border-border rounded-xl px-3 py-3.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-2">
                    {item.icon}
                  </div>
                  <p className="text-xs font-semibold text-foreground leading-tight">{item.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── RIGHT: Auth Content ── */}
          <div className="flex flex-col justify-center w-full max-w-lg mx-auto lg:max-w-none">
            {/* Page Title */}
            <div className="text-center mb-8">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-2 flex items-center justify-center gap-2">
                {title}
                <Sparkles className="h-5 w-5 text-success opacity-70" />
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base max-w-sm mx-auto">{subtitle}</p>
            </div>

            {/* Decorative flanking icons - visible only on large screens */}
            <div className="relative">
              {/* Left decorative elements */}
              <div className="absolute -left-16 top-1/2 -translate-y-1/2 hidden xl:flex flex-col gap-4 items-center opacity-20">
                <div className="w-px h-16 bg-gradient-to-b from-transparent via-emerald-500/50 to-transparent"></div>
                <Leaf className="h-4 w-4 text-success" />
                <div className="w-px h-16 bg-gradient-to-b from-transparent via-emerald-500/50 to-transparent"></div>
              </div>
              {/* Right decorative elements */}
              <div className="absolute -right-16 top-1/2 -translate-y-1/2 hidden xl:flex flex-col gap-4 items-center opacity-20">
                <div className="w-px h-16 bg-gradient-to-b from-transparent via-emerald-500/50 to-transparent"></div>
                <Heart className="h-4 w-4 text-success" />
                <div className="w-px h-16 bg-gradient-to-b from-transparent via-emerald-500/50 to-transparent"></div>
              </div>

              {/* Auth Card */}
              <div className="relative bg-card backdrop-blur-xl border border-emerald-500/15 p-6 sm:p-8 rounded-3xl shadow-lg ring-1 ring-white/[0.03] transition-all duration-500 hover:border-emerald-500/25 hover:shadow-lg">
                {/* Top reflection */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent rounded-t-3xl"></div>

                {children}
              </div>
            </div>

            {/* Footer Links */}
            <div className="mt-6 text-center flex gap-4 justify-center text-xs font-medium text-muted-foreground">
              <Link to="/privacy" className="hover:text-muted-foreground transition-colors">Privacy Policy</Link>
              <span>&middot;</span>
              <Link to="/terms" className="hover:text-muted-foreground transition-colors">Terms of Service</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
