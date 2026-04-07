'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

const data = [
  { name: 'Apr 01', online: 45, offline: 30 },
  { name: 'Apr 02', online: 52, offline: 25 },
  { name: 'Apr 03', online: 48, offline: 35 },
  { name: 'Apr 04', online: 61, offline: 28 },
  { name: 'Apr 05', online: 55, offline: 32 },
  { name: 'Apr 06', online: 65, offline: 22 },
  { name: 'Apr 07', online: 58, offline: 38 },
  { name: 'Apr 08', online: 45, offline: 30 },
  { name: 'Apr 09', online: 52, offline: 25 },
];

export function AgentCurveChart() {
  return (
    <div className="w-full h-70 sm:h-80 bg-white rounded-4xl p-5 sm:p-8 shadow-sm relative overflow-hidden group">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6 sm:mb-8">
        <div>
          <h3 className="text-[18px] font-bold text-[#0B1215]">Agent Curve</h3>
          <div className="flex items-center gap-6 mt-2">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#4FD1C5]" />
              <span className="text-[13px] text-gray-400 font-medium">Online</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#FF9F6A]" />
              <span className="text-[13px] text-gray-400 font-medium">Offline</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-gray-400 font-medium">Sort by:</span>
          <select className="bg-gray-50 border-none rounded-full px-4 py-2 text-[13px] font-bold text-[#0B1215] outline-none shadow-sm cursor-pointer hover:bg-gray-100 transition-colors">
            <option>Day</option>
            <option>Week</option>
            <option>Month</option>
          </select>
        </div>
      </div>

      <div className="h-[200px] w-full relative">
        {/* Value Tag on the chart */}
        <div className="absolute left-[30%] top-[20%] z-10 bg-white shadow-xl rounded-2xl p-4 border border-gray-50 flex flex-col items-center animate-bounce-subtle">
           <span className="text-[11px] text-gray-400 font-bold mb-1">Agents Performance</span>
           <span className="text-[18px] font-black text-dash-teal">-10%</span>
           <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-b border-r border-gray-50 rotate-45" />
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorOnline" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4FD1C5" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#4FD1C5" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorOffline" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FF9F6A" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#FF9F6A" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#94A3B8', fontSize: 13, fontWeight: 500 }} 
              dy={15}
            />
            <YAxis hide />
            <Tooltip 
              contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
            />
            <Area 
              type="monotone" 
              dataKey="online" 
              stroke="#4FD1C5" 
              strokeWidth={4} 
              fillOpacity={1} 
              fill="url(#colorOnline)" 
            />
            <Area 
              type="monotone" 
              dataKey="offline" 
              stroke="#FF9F6A" 
              strokeWidth={4} 
              fillOpacity={1} 
              fill="url(#colorOffline)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
