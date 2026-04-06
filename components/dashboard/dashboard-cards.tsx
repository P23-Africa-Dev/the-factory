'use client';

import React from 'react';
import { 
  MoreHorizontal, 
  CheckCircle2, 
  ChevronRight, 
  Search,
  Sparkles,
  ArrowUpRight
} from 'lucide-react';
import { cn } from '@/lib/utils/sample';

export function TopCustomers() {
  const customers = [
    { id: 1, name: 'Lane Wade', type: 'E-commerce', avatar: 'https://i.pravatar.cc/150?u=lane' },
    { id: 2, name: 'Lane Wade', type: 'E-commerce', avatar: 'https://i.pravatar.cc/150?u=lane2', active: true },
  ];

  return (
    <div className="bg-dash-dark rounded-[32px] p-8 text-white h-full flex flex-col shadow-2xl relative overflow-hidden ring-1 ring-white/5">
        <div className="flex justify-between items-start mb-10">
            <h3 className="text-white font-bold text-lg tracking-tight">Top Customers</h3>
            <div className="flex items-center gap-1 bg-white/10 px-3 py-1.5 rounded-xl cursor-pointer hover:bg-white/20 transition-all font-bold text-[10px]">
                <span>Weekly</span>
                <ChevronRight size={10} className="rotate-90" />
            </div>
        </div>
        
        {/* Accurate Triple Ring Chart */}
        <div className="relative flex justify-center mb-12">
            <div className="relative w-48 h-48 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90 drop-shadow-[0_0_20px_rgba(79,209,197,0.15)]">
                    {/* Ring 1 (Inner - Red) */}
                    <circle cx="96" cy="96" r="38" stroke="currentColor" strokeWidth="14" fill="transparent" className="text-white/5" />
                    <circle cx="96" cy="96" r="38" stroke="currentColor" strokeWidth="14" fill="transparent" strokeDasharray="239" strokeDashoffset="48" strokeLinecap="round" className="text-dash-red" />
                    
                    {/* Ring 2 (Middle - Orange) */}
                    <circle cx="96" cy="96" r="58" stroke="currentColor" strokeWidth="14" fill="transparent" className="text-white/5" />
                    <circle cx="96" cy="96" r="58" stroke="currentColor" strokeWidth="14" fill="transparent" strokeDasharray="364" strokeDashoffset="73" strokeLinecap="round" className="text-dash-orange" />
                    
                    {/* Ring 3 (Outer - Teal) */}
                    <circle cx="96" cy="96" r="78" stroke="currentColor" strokeWidth="14" fill="transparent" className="text-white/5" />
                    <circle cx="96" cy="96" r="78" stroke="currentColor" strokeWidth="14" fill="transparent" strokeDasharray="490" strokeDashoffset="40" strokeLinecap="round" className="text-dash-teal" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[34px] font-black text-white drop-shadow-lg">99%</span>
                </div>
            </div>
        </div>

        <div className="flex justify-center gap-6 mb-12 text-[11px] font-bold text-white/70">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-dash-teal" /> Customer 1</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-dash-orange" /> Customer 2</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-dash-red" /> Customer 3</div>
        </div>
        
        <div className="space-y-4">
            {customers.map((c) => (
                <div 
                    key={c.id} 
                    className={cn(
                        "flex items-center justify-between p-4 rounded-[28px] transition-all cursor-pointer group",
                        c.active ? "bg-white text-dash-dark shadow-2xl scale-[1.02]" : "bg-white/5 text-white hover:bg-white/10"
                    )}
                >
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "w-12 h-12 rounded-full border-2 p-0.5 transition-all duration-500",
                            c.active ? "border-dash-teal shadow-inner" : "border-dash-teal/20 group-hover:border-dash-teal"
                        )}>
                             <img src={c.avatar} alt={c.name} className="w-full h-full rounded-full object-cover" />
                        </div>
                        <div>
                            <p className={cn("text-sm font-bold tracking-tight", c.active ? "text-dash-dark" : "text-white")}>{c.name}</p>
                            <p className={cn("text-[11px] font-semibold", c.active ? "text-dash-dark/40" : "text-white/30")}>{c.type}</p>
                        </div>
                    </div>
                    <button className={cn("transition-colors", c.active ? "text-dash-dark/20" : "text-white/30 hover:text-white")}>
                        <MoreHorizontal size={22} />
                    </button>
                </div>
            ))}
        </div>
    </div>
  );
}

export function WeeklyTasks() {
  return (
    <div className="scalloped-edges rounded-[32px] p-8 text-dash-dark h-full flex flex-col shadow-2xl relative border border-dash-dark/5 bg-white">
        <div className="flex justify-between items-start mb-12">
            <h3 className="text-dash-dark font-bold text-lg tracking-tight">Weekly Tasks</h3>
            <div className="flex items-center gap-1 bg-dash-bg px-3 py-1.5 rounded-xl cursor-pointer text-dash-dark/60 hover:text-dash-dark transition-all">
                <span className="text-[10px] font-bold">Daily</span>
                <ChevronRight size={10} className="rotate-90" />
            </div>
        </div>
        
        {/* Adjusted Side-by-Side Statistics */}
        <div className="flex items-start gap-12 mb-12">
            <div>
                <p className="text-[52px] font-black tracking-tighter leading-none mb-1">70%</p>
                <p className="text-[11px] text-dash-dark/40 font-bold uppercase tracking-wider">Task Completed</p>
            </div>
            <div>
                <p className="text-[52px] font-black tracking-tighter leading-none mb-1">31%</p>
                <p className="text-[11px] text-dash-dark/40 font-bold uppercase tracking-wider">Better than previous intervals</p>
            </div>
        </div>

        {/* Improved Status Bar */}
        <div className="bg-[#E0EEF0] text-[#498C8E] p-5 rounded-[24px] flex items-center gap-4 mb-14 text-[12px] font-bold border border-[#4FD1C5]/10 shadow-sm">
            <div className="w-8 h-8 rounded-full bg-white/50 flex items-center justify-center shadow-inner border border-white/40">
                <span className="text-xl leading-none">😊</span>
            </div>
            Your work balance this week. Awesome!
        </div>
        
        <div className="mb-14 relative">
            <div className="flex justify-between items-center mb-6 px-1">
                <p className="text-[14px] font-black uppercase tracking-[0.1em] text-dash-dark/80">Ongoing Task</p>
            </div>
            
            <div className="relative pt-6">
                {/* Floating Attendee Marker */}
                <div className="absolute top-0 left-[42%] -translate-x-1/2 flex items-center gap-1.5 bg-[#FF7E5F] text-white px-2 py-1 rounded-full text-[9px] font-black shadow-lg shadow-dash-orange/30 z-20 whitespace-nowrap -translate-y-1">
                     <div className="w-4 h-4 rounded-full border border-white/40 overflow-hidden">
                        <img src="https://i.pravatar.cc/150?u=kwame" className="w-full h-full object-cover" />
                     </div>
                     Alex ... 42%
                </div>
                
                <div className="w-full h-5 bg-dash-bg rounded-full overflow-hidden p-1.5 shadow-inner ring-1 ring-dash-dark/5">
                    <div className="w-[42%] h-full bg-dash-orange rounded-full shadow-lg" />
                </div>
            </div>
        </div>

        <button className="w-full bg-dash-purple text-white py-5 rounded-[24px] flex items-center justify-between px-8 hover:opacity-95 transition-all font-black text-sm shadow-xl shadow-dash-purple/20 group mt-auto">
            View All Task
            <ChevronRight size={24} className="group-hover:translate-x-1 transition-transform" />
        </button>
    </div>
  );
}

export function CRMPipeline() {
  return (
    <div className="bg-gradient-to-br from-[#D15FE2] to-[#B14FD2] rounded-[32px] p-8 text-white h-full flex flex-col justify-between shadow-2xl relative overflow-hidden group hover:scale-[1.02] transition-all duration-500 cursor-pointer">
        <div className="absolute -right-16 -top-16 w-56 h-56 bg-white/10 rounded-full blur-[80px] group-hover:bg-white/20 transition-all duration-700" />
        
        <div className="w-16 h-16 bg-white/20 backdrop-blur-xl rounded-[22px] flex items-center justify-center mb-6 shadow-inner border border-white/10 group-hover:bg-white/30 transition-all">
            <Search size={28} className="text-white drop-shadow-md" />
        </div>
        
        <div>
            <h4 className="text-2xl font-black mb-3 tracking-tight">View CRM Pipeline</h4>
            <p className="text-[11px] text-white/70 leading-relaxed max-w-[220px] font-medium">
                Get an intelligent review of your current leads, outreach performance, and engagement trends.
            </p>
        </div>
        
        <div className="absolute bottom-8 right-8">
            <div className="w-12 h-12 rounded-full border-2 border-white/20 flex items-center justify-center group-hover:bg-white/10 group-hover:border-white transition-all shadow-xl">
                <ArrowUpRight size={22} />
            </div>
        </div>
    </div>
  );
}

export function AIWorkspace() {
  return (
    <div className="bg-gradient-to-br from-[#78B3B3] to-[#5A8E8E] rounded-[32px] p-8 text-white h-full flex flex-col justify-between shadow-2xl group cursor-pointer border border-white/10 relative overflow-hidden transition-all duration-500 hover:scale-[1.02]">
        <div className="absolute -right-16 -bottom-16 w-56 h-56 bg-black/5 rounded-full blur-[80px] group-hover:bg-black/10 transition-all duration-700" />

        <div>
            <div className="w-16 h-16 bg-dash-dark/20 backdrop-blur-xl rounded-[22px] flex items-center justify-center mb-6 shadow-inner border border-black/5 group-hover:bg-dash-dark/30 transition-all">
                <Sparkles size={28} className="text-white drop-shadow-md" />
            </div>
            
            <h4 className="text-2xl font-black mb-3 tracking-tight">AI Workspace</h4>
            <p className="text-[11px] text-white/70 leading-relaxed max-w-[220px] font-medium">
                Generate leads, draft recommendations using single line prompt.
            </p>
        </div>
        
        <button className="w-full bg-dash-dark text-white py-5 rounded-[22px] flex items-center justify-center gap-3 hover:bg-black transition-all font-black text-sm shadow-2xl tracking-tighter mt-4 ring-1 ring-white/5">
            Ask AI
        </button>
    </div>
  );
}
