'use client';

import React, { useEffect, useState } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  ReferenceLine
} from 'recharts';
import { ArrowUpRight, MoreHorizontal } from 'lucide-react';

const activitiesData = [
  { name: 'Mon', value: 30 },
  { name: 'Tue', value: 25 },
  { name: 'Wed', value: 40 },
  { name: 'Thu', value: 35 },
  { name: 'Fri', value: 55 },
  { name: 'Sat', value: 45 },
  { name: 'Sun', value: 60 },
];

const leadsData = [
  { name: '1', v1: 2000, v2: 1500 },
  { name: '2', v1: 3000, v2: 2400 },
  { name: '3', v1: 2500, v2: 2100 },
  { name: '4', v1: 3500, v2: 2800 },
  { name: '5', v1: 3200, v2: 2600 },
  { name: '6', v1: 4100, v2: 3200 },
  { name: '7', v1: 3800, v2: 2900 },
  { name: '8', v1: 4500, v2: 3500 },
];

export function MyActivitiesChart() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-full w-full" />;

  return (
    <div className="bg-[#78B3B3] rounded-[24px] p-6 text-white h-full flex flex-col relative overflow-hidden shadow-2xl">
        <div className="flex justify-between items-start mb-2 relative z-10">
            <div>
                <h3 className="text-white/80 text-[13px] font-bold tracking-tight">My Activities</h3>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-4xl font-bold tracking-tighter">60%</span>
                    <ArrowUpRight className="text-white/80" size={18} strokeWidth={3} />
                </div>
            </div>
            <button className="text-white/60 hover:text-white transition-colors">
                <MoreHorizontal size={20} />
            </button>
        </div>
        
        <div className="flex-1 w-full min-h-[100px] mt-2 relative z-10">
            <ResponsiveContainer width="100%" height="100%" minHeight={0} minWidth={0}>
                <AreaChart data={activitiesData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="white" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="white" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <ReferenceLine y={45} stroke="white" strokeDasharray="3 3" strokeOpacity={0.4} />
                    <Area 
                        type="monotone" 
                        dataKey="value" 
                        stroke="white" 
                        strokeWidth={4}
                        fillOpacity={1} 
                        fill="url(#colorValue)" 
                        dot={false}
                        activeDot={{ r: 6, fill: "white", strokeWidth: 0 }}
                    />
                </AreaChart>
            </ResponsiveContainer>
            
            {/* The glow point at the end of the line */}
            <div className="absolute right-[5%] bottom-[35%] w-3 h-3 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,1)] z-20" />
        </div>
        
        {/* Decorative dashed lines spanning the card */}
        <div className="absolute inset-0 pointer-events-none opacity-10">
            <div className="absolute left-[30%] top-0 bottom-0 border-l border-dashed border-white" />
            <div className="absolute left-0 right-0 top-[60%] border-t border-dashed border-white" />
        </div>
    </div>
  );
}

export function TotalLeadsChart() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-full w-full" />;

  return (
    <div className="bg-white rounded-[24px] p-6 text-dash-dark h-full flex flex-col shadow-2xl relative">
        <div className="flex justify-between items-start mb-4">
            <div>
                <h3 className="text-dash-dark/40 text-[13px] font-bold">Total Leads</h3>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-4xl font-bold tracking-tighter">4,100</span>
                    <span className="text-dash-dark/40 text-sm font-bold mt-2">Leads</span>
                </div>
            </div>
            <button className="bg-dash-bg px-4 py-1.5 rounded-xl text-[11px] font-bold text-dash-dark/60 hover:text-dash-dark transition-colors border border-dash-dark/5">
                View
            </button>
        </div>
        
        <div className="flex-1 w-full min-h-[100px]">
            <ResponsiveContainer width="100%" height="100%" minHeight={0} minWidth={0}>
                <BarChart data={leadsData} barGap={4}>
                    <Bar 
                        dataKey="v1" 
                        fill="#4FD1C5" 
                        radius={[6, 6, 6, 6]} 
                        barSize={8}
                    />
                    <Bar 
                        dataKey="v2" 
                        fill="#FF7E5F" 
                        radius={[6, 6, 6, 6]} 
                        barSize={8}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
        
        {/* Colorful status dots matching the screenshot */}
        <div className="flex items-center justify-between mt-4 px-2">
             <div className="w-4 h-4 rounded-full bg-dash-teal opacity-60" />
             <div className="w-4 h-4 rounded-full bg-dash-orange" />
             <div className="w-4 h-4 rounded-full bg-dash-blue opacity-80" />
             <div className="w-4 h-4 rounded-full bg-dash-purple opacity-40" />
             <div className="w-4 h-4 rounded-full bg-dash-teal" />
             <div className="w-4 h-4 rounded-full bg-dash-orange opacity-40" />
             <div className="w-4 h-4 rounded-full bg-dash-blue" />
             <div className="w-4 h-4 rounded-full bg-dash-orange" />
        </div>
    </div>
  );
}
