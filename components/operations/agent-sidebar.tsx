'use client';

import { MessageSquare, Map, Plus, MapPin } from 'lucide-react';

export function AgentSidebar() {
  return (
    <div className="flex flex-col gap-5 w-full xl:w-90 xl:shrink-0">

      {/* ── Agent Info (no card — sits on page background) ── */}
      <div>
        {/* Info row */}
        <div className="flex flex-col sm:flex-row items-start gap-6">

          {/* Left: details */}
          <div className="flex-1 space-y-4 min-w-0">
            <div>
              <h3 className="text-[17px] font-bold text-dash-dark">Lane Wade</h3>
              <p className="text-[12px] text-gray-400 mt-1 leading-relaxed">
                Visit the Ikeja Computer village, and promote...
              </p>
            </div>
            <div>
              <p className="text-[13px] font-bold text-dash-dark mb-0.5">Zone</p>
              <p className="text-[13px] text-gray-400">Ikeja LGA</p>
            </div>
            <div>
              <p className="text-[13px] font-bold text-dash-dark mb-0.5">Phone Number</p>
              <p className="text-[13px] text-gray-400">+234 803 4567890</p>
            </div>
            <div>
              <p className="text-[13px] font-bold text-dash-dark mb-0.5">Role</p>
              <p className="text-[13px] text-gray-400">Field Agent</p>
            </div>
          </div>

          {/* Right: photo card */}
          <div className="shrink-0 relative w-36">
            <div className="w-36 h-44 rounded-3xl overflow-hidden shadow-lg bg-[#C9A84C]">
              <img
                src="https://i.pravatar.cc/150?u=lane"
                className="w-full h-full object-cover"
                alt="Lane Wade"
              />
            </div>
            {/* Name + status overlay */}
            <div className="mt-2 text-center">
              <p className="text-[12px] font-bold text-dash-dark">Lane Wade</p>
              <div className="flex items-center justify-center gap-2 mt-0.5">
                <span className="text-[11px] text-gray-400">Ikeja LGA</span>
                <span className="px-2 py-0.5 bg-[#9D4EDD] text-white rounded-full text-[9px] font-bold">Online</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons — right-aligned under photo */}
        <div className="flex justify-end gap-3 mt-4">
          <button className="w-10 h-10 bg-white text-gray-400 rounded-full flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-100 shadow-sm">
            <MessageSquare size={15} />
          </button>
          <button className="w-10 h-10 bg-white text-gray-400 rounded-full flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-100 shadow-sm">
            <Map size={15} />
          </button>
          <button className="w-10 h-10 bg-white text-gray-400 rounded-full flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-100 shadow-sm">
            <Plus size={15} />
          </button>
        </div>
      </div>

      {/* ── Live Details Card ────────────────────────────── */}
      <div className="bg-dash-dark rounded-4xl p-6 shadow-2xl">
        <h3 className="text-[16px] font-bold text-white mb-4">Live Details</h3>

        {/* Map preview */}
        <div className="relative h-44 w-full rounded-[18px] bg-[#e8ecef] overflow-hidden">
          {/* Street grid */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-50">
            <defs>
              <pattern id="livegrid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#CBD5E1" strokeWidth="0.8"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#livegrid)" />
          </svg>

          {/* Vertical street stripe (Dresden St) */}
          <div className="absolute left-[28%] top-0 bottom-0 w-10 bg-white/60 pointer-events-none" />

          {/* Horizontal street stripe */}
          <div className="absolute top-[45%] left-0 right-0 h-8 bg-white/60 pointer-events-none" />

          {/* Green block (landmark) */}
          <div className="absolute right-0 top-[30%] w-12 h-16 bg-[#A8D5B5]/60 pointer-events-none" />

          {/* Street labels */}
          <div className="absolute pointer-events-none" style={{ left: '26%', top: 8 }}>
            <div className="flex flex-col items-center">
              <span className="text-[9px] font-semibold text-gray-600 leading-tight">Dresd</span>
              <span className="text-[9px] font-semibold text-gray-600 leading-tight">Street</span>
            </div>
          </div>

          <div className="absolute right-2 top-[18%] pointer-events-none">
            <span className="text-[8px] font-semibold text-gray-500 leading-tight block">McDo</span>
            <span className="text-[8px] font-semibold text-gray-500 leading-tight block">ell Str</span>
          </div>

          {/* Red pin */}
          <div className="absolute" style={{ left: '30%', top: '28%' }}>
            <MapPin size={20} className="text-red-500 fill-red-500 drop-shadow-md" />
          </div>

          {/* Agent marker */}
          <div className="absolute flex flex-col items-center" style={{ left: 'calc(30% - 14px)', top: '50%' }}>
            <div className="w-7 h-7 rounded-full border-2 border-white shadow-md overflow-hidden">
              <img src="https://i.pravatar.cc/150?u=lane" className="w-full h-full object-cover" alt="Agent" />
            </div>
            <div className="bg-white px-2 py-0.5 rounded-lg mt-1 whitespace-nowrap shadow-md">
              <p className="text-[8px] font-bold text-dash-dark">Lane Wade</p>
              <p className="text-[7px] text-gray-400">Active at Kemsi Street</p>
            </div>
          </div>

          {/* Destination marker */}
          <div className="absolute" style={{ left: '58%', top: '30%' }}>
            <div className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center border-4 border-[#C77DFF]/50 shadow-md">
              <div className="w-3 h-3 bg-[#9D4EDD] rounded-full" />
            </div>
          </div>
        </div>

        {/* Progress bars — split bar with labels */}
        <div className="mt-4">
          <div className="flex rounded-full overflow-hidden h-3">
            <div className="w-[38%] bg-dash-teal" />
            <div className="w-[62%] bg-[#EF5350]" />
          </div>
          <div className="flex justify-between mt-1.5">
            <p className="text-[11px] text-gray-400">Completed</p>
            <p className="text-[11px] text-gray-400">Pending</p>
          </div>
        </div>

        {/* CTA — auto width pill, left-aligned */}
        <div className="mt-4">
          <button className="px-5 py-2.5 bg-[#9D4EDD] text-white rounded-full text-[12px] font-bold hover:opacity-90 transition-all inline-flex items-center gap-2">
            Active (View on Map)
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          </button>
          <p className="text-[11px] text-gray-500 mt-2">Online</p>
        </div>
      </div>
    </div>
  );
}
