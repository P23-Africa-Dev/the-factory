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
                Live GPS tracking across your entire field force. Know who is where, when they arrived, and how long they stayed. No check-in calls. No guesswork.
              </p>
            </div>
          </div>

          {/* Card 2 — Own your territories */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-7 flex flex-col gap-5 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-full bg-[#F3EEFF] flex items-center justify-center shrink-0">
              <Target className="w-5 h-5 text-[#A855F7]" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B252C] mb-2">Own your territories</h3>
              <p className="text-sm text-[#4A5F64] leading-relaxed">
                Divide and assign areas so your team knows exactly where to work. Stop losing deals to overlap, gaps, or agents working the wrong zones.
              </p>
            </div>
          </div>

          {/* Card 3 — Track every lead and task */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-7 flex flex-col gap-5 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-full bg-[#E6FAF8] flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-[#14B8A6]" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B252C] mb-2">Track every lead and task</h3>
              <p className="text-sm text-[#4A5F64] leading-relaxed">
                CRM and project management in one place. Every follow-up, assignment, and activity logged. Nothing falls through.
              </p>
            </div>
          </div>

        </div>

        {/* Bottom row — 1 feature card + stats */}
        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* Card 4 — Automate your outreach */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-7 flex flex-col gap-5 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-full bg-[#FEFCE8] flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-[#CA8A04]" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B252C] mb-2">Automate your outreach</h3>
              <p className="text-sm text-[#4A5F64] leading-relaxed">
                AI-powered sequences that run from your own connected inbox. The platform decides when and who to contact next.
              </p>
            </div>
          </div>

          {/* Stats block — spans the remaining 2 columns */}
          <div className="md:col-span-2 flex flex-row items-center justify-center sm:justify-start gap-16 sm:gap-24 px-4 sm:px-10">
            <div>
              <div className="text-5xl lg:text-6xl font-extrabold text-[#0B252C] tracking-tight">
                25k +
              </div>
              <div className="text-xs sm:text-sm font-semibold text-[#4A5F64] mt-2 tracking-wide">
                Total Users
              </div>
            </div>
            <div>
              <div className="text-5xl lg:text-6xl font-extrabold text-[#0B252C] tracking-tight">
                1.5k +
              </div>
              <div className="text-xs sm:text-sm font-semibold text-[#4A5F64] mt-2 tracking-wide">
                Users Ratings
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
