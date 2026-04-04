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
          <div className="space-y-1">
            <h1 className="text-[36px] font-extrabold leading-[38px] text-[#F6F6F6] font-[family:var(--font-poppins)]">
              Hi, Kwame!
            </h1>
            <p className="text-[20px] font-normal leading-[23px] text-[#F6F6F6] font-[family:var(--font-poppins)]">
              What can we help you with today?
            </p>
          </div>
          
          <div className="flex items-center gap-4 text-right">
            <span className="text-[64px] font-bold leading-none align-middle font-[family:var(--font-montserrat)] text-white">
                {day}
            </span>
            <div className="flex flex-col items-start leading-none justify-center">
              <span className="text-[10px] font-semibold leading-none align-middle font-[family:var(--font-poppins)] text-white">{weekDay}</span>
              <span className="text-[15px] font-black leading-none align-middle font-[family:var(--font-poppins)] text-white">{month}</span>
            </div>
          </div>
        </div>

        {/* Floating Top Section Cards - Overlapping the section transition */}
        {/* <div className="max-w-7xl mx-auto grid grid-cols-12 gap-8 mt-16 absolute left-12 right-12 bottom-[-100px] z-[30]">
            <div className="col-span-12 lg:col-start-5 lg:col-span-3 h-[200px]">
                <MyActivitiesChart />
            </div>
            <div className="col-span-12 lg:col-span-3 h-[200px]">
                <TotalLeadsChart />
            </div>
        </div> */}
      </div>

      {/* Main Content Area (White background) */}
      <div className="bg-[#F4F7F9] min-h-screen pt-40 pb-16 px-12 relative z-10 shadow-inner">
        
      </div>
    </div>
  );
}
