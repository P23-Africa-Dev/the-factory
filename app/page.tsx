"use client";

import Image from "next/image";
import Link from "next/link";
import { 
  ArrowRight, 
  Cpu, 
  Database, 
  Zap, 
  Globe, 
  BarChart3, 
  ChevronRight,
  ShieldCheck,
  CheckCircle2
} from "lucide-react";
import Logo from "@/assets/images/logo.png";
import Button from "@/components/ui/button";

export default function Home() {
  return (
    <div className="relative min-h-screen w-full flex flex-col bg-[#0A1618] overflow-x-hidden selection:bg-[#6FA8A6]/30 font-sans">
      {/* Cinematic Background */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/landing/hero.png"
          alt="Factory 23 - Industrial AI"
          fill
          className="object-cover opacity-30 mix-blend-overlay"
          priority
        />
        {/* Multilayered Overlays for Depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A1618] via-[#0A1618]/60 to-[#0A1618]" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#0A1618] to-transparent" />
        <div className="absolute top-[20%] left-[-10%] w-[600px] h-[600px] bg-[#6FA8A6]/5 rounded-full blur-[120px] pointer-events-none" />
      </div>

      {/* Floating Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 flex justify-center px-6 py-6 md:px-12 lg:px-24">
        <nav className="flex w-full max-w-7xl items-center justify-between rounded-[28px] border border-white/10 bg-white/[0.03] px-6 py-3 shadow-2xl backdrop-blur-xl transition-all">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative h-10 w-10 overflow-hidden rounded-xl bg-white/[0.05] p-2 transition-transform group-hover:scale-105">
              <Image
                src={Logo}
                alt="Logo"
                fill
                className="object-contain p-1.5"
              />
            </div>
            <h1 className="text-white text-xl font-extrabold tracking-tight">Factory <span className="text-[#6FA8A6]">23</span></h1>
          </Link>
          
          <div className="hidden items-center gap-10 md:flex">
             <Link href="#" className="text-[12px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors">Solutions</Link>
             <Link href="#" className="text-[12px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors">Infrastructure</Link>
             <Link href="#" className="text-[12px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors">Security</Link>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/login" className="hidden px-4 text-xs font-bold uppercase tracking-widest text-white/60 hover:text-white transition-colors sm:block">
              Login
            </Link>
            <Link href="/register">
              <Button className="h-10 rounded-full bg-[#6FA8A6] px-8 text-[11px] font-bold uppercase tracking-widest text-[#0A1618] hover:bg-[#A3E635] shadow-lg transition-all">
                Get Started
              </Button>
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Content */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pt-32 pb-20 md:px-12 lg:px-24">
        <div className="w-full max-w-6xl">
          <div className="flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-8 duration-1000">
            {/* Tagline */}
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-1.5">
              <div className="h-2 w-2 rounded-full bg-[#A3E635] animate-pulse shadow-[0_0_8px_rgba(163,230,53,1)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#6FA8A6]">
                Systems Operational · Genesis v2.4
              </span>
            </div>

            {/* Main Headline */}
            <h2 className="text-5xl font-black tracking-tighter text-white sm:text-7xl md:text-8xl lg:text-9xl">
              Factory 23
              {/* Precision <br />
              <span className="bg-gradient-to-r from-white via-[#6FA8A6] to-[#A3E635] bg-clip-text text-transparent italic">
                Engineering.
              </span> */}
            </h2>
            
            <p className="mt-10 max-w-2xl text-lg font-medium leading-relaxed text-white/40 md:text-xl">
              Orchestrating the next generation of industrial intelligence. Real-time logistics, autonomous workflows, and enterprise-grade tracking at scale.
            </p>

            <div className="mt-12 flex flex-col items-center justify-center gap-6 sm:flex-row">
              <Link href="/register" className="group w-full sm:w-auto">
              <Button className="h-[64px] min-w-[240px] rounded-full bg-[#6FA8A6] px-8 text-[11px] font-bold uppercase tracking-widest text-[#0A1618] hover:bg-[#A3E635] shadow-lg transition-all">
                  Deploy System <ArrowRight className="ml-2 inline-block transition-transform group-hover:translate-x-1" size={18} />
                </Button>
              </Link>
              <Link href="/enterprise/schedule-demo" className="w-full sm:w-auto">
                <Button variant="outline" className="h-[64px] min-w-[240px] rounded-2xl border-white/10 bg-white/5 text-sm font-black uppercase tracking-widest text-white backdrop-blur-xl hover:bg-white/10 transition-all active:scale-[0.98]">
                  Schedule Demo
                </Button>
              </Link>
            </div>
          </div>

          {/* Social Proof Elements */}
          <div className="mt-32 grid grid-cols-2 gap-8 border-t border-white/5 pt-12 text-center md:grid-cols-4 animate-in fade-in slide-in-from-bottom-4 delay-500 duration-1000">
             <div className="flex flex-col gap-1">
               <span className="text-3xl font-black text-white">99.9<span className="text-[#6FA8A6]">%</span></span>
               <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">Uptime</span>
             </div>
             <div className="flex flex-col gap-1">
               <span className="text-3xl font-black text-white">250<span className="text-[#6FA8A6]">+</span></span>
               <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">Warehouses</span>
             </div>
             <div className="flex flex-col gap-1">
               <span className="text-3xl font-black text-white">12M<span className="text-[#6FA8A6]">s</span></span>
               <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">Latency</span>
             </div>
             <div className="flex flex-col gap-1">
               <span className="text-3xl font-black text-white">24<span className="text-[#6FA8A6]">/7</span></span>
               <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">Monitoring</span>
             </div>
          </div>

          {/* Features Preview Cards */}
          <div className="mt-20 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              { icon: Cpu, title: "Autonomous Ops", desc: "Edge computing for real-time robotic coordination." },
              { icon: Database, title: "Unified Ledger", desc: "Transparent, immutable tracking across the supply chain." },
              { icon: Zap, title: "Hyper Logistics", desc: "Optimized routing for zero-idle production cycles." }
            ].map((feature, i) => (
              <div 
                key={i}
                className="group relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.03] p-8 transition-all hover:bg-white/[0.06] hover:-translate-y-1"
              >
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#6FA8A6]/10 text-[#6FA8A6] border border-[#6FA8A6]/20 transition-transform group-hover:scale-110">
                  <feature.icon size={28} />
                </div>
                <h3 className="text-xl font-black text-white">{feature.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/40">{feature.desc}</p>
                <div className="mt-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#6FA8A6] opacity-0 group-hover:opacity-100 transition-opacity">
                  Learn More <ChevronRight size={12} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-20 mt-auto px-6 py-12 md:px-12 lg:px-24">
        <div className="flex flex-col items-center justify-between gap-8 border-t border-white/5 pt-12 md:flex-row">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-white/5 p-2 grayscale contrast-200 opacity-20">
              <Image src={Logo} alt="Logo" className="w-full h-full object-contain" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/10">© 2024 Factory 23 Industrial Architecture</span>
          </div>
          
          <div className="flex gap-12">
            {[
              { label: "Stability", icon: ShieldCheck },
              { label: "Privacy", icon: CheckCircle2 },
              { label: "Architecture", icon: BarChart3 }
            ].map((item, i) => (
              <Link 
                key={i} 
                href="#" 
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/10 hover:text-[#6FA8A6] transition-colors"
              >
                <item.icon size={14} strokeWidth={2.5} />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
