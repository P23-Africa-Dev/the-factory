"use client";

import { MapPin, Target, Activity, Sparkles } from "lucide-react";

export default function FeaturesSection() {
  return (
    <section className="w-full bg-[#F9FDFF] py-20 lg:py-28 px-6 sm:px-12 lg:px-24 font-sans border-t border-[#E8F4F8]">
      <div className="max-w-5xl mx-auto flex flex-col items-center gap-14">

        {/* Section Header */}
        <div className="text-center max-w-2xl">
          <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-[#0B252C] leading-tight tracking-tight">
            Your field team is out there. Do you know what they&rsquo;re doing?
          </h2>
          <p className="text-sm sm:text-base text-[#4A5F64] leading-relaxed mt-4">
            Real-time field operations management for Africa.
          </p>
        </div>

        {/* Top row — 3 feature cards */}
        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* Card 1 — See your team in real time */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-7 flex flex-col gap-5 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-full bg-[#EBF3FF] flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-[#3B82F6]" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B252C] mb-2">See your team in real time</h3>
              <p className="text-sm text-[#4A5F64] leading-relaxed">
                Live GPS tracking across territories. See agent locations, movement status, and active tasks on an interactive map.
              </p>
            </div>
          </div>

          {/* Card 2 — Track every visit and task */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-7 flex flex-col gap-5 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-full bg-[#FEF3C7] flex items-center justify-center shrink-0">
              <Target className="w-5 h-5 text-[#D97706]" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B252C] mb-2">Track every visit and task</h3>
              <p className="text-sm text-[#4A5F64] leading-relaxed">
                Check-ins, check-outs, photos, forms, and client signoffs. Know when visits happen and what was accomplished.
              </p>
            </div>
          </div>

          {/* Card 3 — Works 100% offline */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-7 flex flex-col gap-5 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-full bg-[#DCFCE7] flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-[#16A34A]" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B252C] mb-2">Works 100% offline</h3>
              <p className="text-sm text-[#4A5F64] leading-relaxed">
                No signal? No problem. Agents log visits, take photos, and complete tasks offline. Everything syncs when back online.
              </p>
            </div>
          </div>

        </div>

        {/* Bottom row — ELY AI highlight card */}
        <div className="w-full bg-gradient-to-br from-[#0B252C] via-[#113843] to-[#0A1F25] rounded-3xl p-8 sm:p-10 border border-[#1E5A69]/30 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex flex-col gap-3 max-w-xl">
            <div className="inline-flex items-center gap-2 bg-amber-400/10 border border-amber-300/30 text-amber-300 text-xs font-bold px-3 py-1 rounded-full self-start">
              <Sparkles className="w-3.5 h-3.5" />
              Powered by ELY Field AI
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold leading-tight">
              Intelligent route optimization & automated task dispatch
            </h3>
            <p className="text-sm text-white/80 leading-relaxed">
              ELY analyzes agent routes and daily schedules to cut transit times by up to 28% while boosting completed client visits per day.
            </p>
          </div>
          <div className="shrink-0 flex flex-col items-center justify-center bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-6 text-center min-w-[200px]">
            <span className="text-4xl font-extrabold text-[#9BDD7C]">+35%</span>
            <span className="text-xs font-bold text-white/90 mt-1">Weekly Field Productivity</span>
          </div>
        </div>

      </div>
    </section>
  );
}
