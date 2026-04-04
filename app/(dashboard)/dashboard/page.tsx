import React from 'react';
import { MyActivitiesChart, TotalLeadsChart } from '@/components/dashboard/dashboard-charts';

export default function DashboardPage() {
  const currentDate = new Date('2026-07-29'); // Matching the screenshot
  const day = currentDate.getDate();
  const weekDay = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
  const month = currentDate.toLocaleDateString('en-US', { month: 'long' });

  return (
    <div className="min-h-full bg-[#09232D] text-white overflow-x-hidden">
      {/* Header Section with Grid Texture */}
      <div className="px-12 pt-16 pb-32 relative hero-grid">

        <div className="max-w-7xl mx-auto flex justify-between items-end relative z-10">
          <div className="space-y-4">
            <h1 className="text-7xl font-bold tracking-tight">
              Hi, Kwame!
            </h1>
            <p className="text-2xl text-white/50 font-medium tracking-tight">
              What can we help you with today?
            </p>
          </div>
          
          <div className="flex items-center gap-6 text-right pb-2">
            <span className="text-[120px] font-black leading-none tracking-tighter text-white opacity-100 drop-shadow-2xl">
                {day}
            </span>
            <div className="flex flex-col items-start leading-[1.1] mb-2">
              <span className="text-2xl font-bold text-white tracking-wide">{weekDay}</span>
              <span className="text-2xl font-medium text-white/40">{month}</span>
            </div>
          </div>
        </div>

        {/* Floating Top Section Cards - Overlapping the section transition */}
        <div className="max-w-7xl mx-auto grid grid-cols-12 gap-8 mt-16 absolute left-12 right-12 bottom-[-100px] z-[30]">
            <div className="col-span-12 lg:col-start-5 lg:col-span-3 h-[200px]">
                <MyActivitiesChart />
            </div>
            <div className="col-span-12 lg:col-span-3 h-[200px]">
                <TotalLeadsChart />
            </div>
        </div>
      </div>

      {/* Main Content Area (White background) */}
      <div className="bg-[#F4F7F9] min-h-screen pt-40 pb-16 px-12 relative z-10 shadow-inner">
        
      </div>
    </div>
  );
}
