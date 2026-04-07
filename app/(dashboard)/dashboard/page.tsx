import React from "react";
import {
  MyActivitiesChart,
  TotalLeadsChart,
} from "@/components/dashboard/dashboard-charts";
import { TopCustomers } from "@/components/dashboard/dashboard-top-customers";
import {
  WeeklyTasks,
  CRMPipeline,
  AIWorkspace,
} from "@/components/dashboard/dashboard-cards";
import { DashboardMap } from "@/components/dashboard/dashboard-map";

export default function DashboardPage() {
  const currentDate = new Date("2026-07-29"); // Matching the screenshot
  const day = currentDate.getDate();
  const weekDay = currentDate.toLocaleDateString("en-US", { weekday: "long" });
  const month = currentDate.toLocaleDateString("en-US", { month: "long" });

  return (
    <div className="min-h-full bg-[#09232D] text-white overflow-x-hidden">
      {/* Header Section with Grid Texture */}
      <div className="px-6 md:px-12 pt-24 md:pt-16 pb-20 md:pb-32 relative hero-grid">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:justify-between md:items-end gap-10 md:gap-0 relative z-10">
          <div className="space-y-1">
            <h1 className="text-[28px] md:text-[36px] font-extrabold leading-tight md:leading-9.5 text-[#F6F6F6]">
              Hi, Kwame!
            </h1>
            <p className="text-[16px] md:text-[20px] leading-tight md:leading-5.75 text-[#F6F6F6] font-(--font-poppins) max-w-66.75">
              What can we help you with today?
            </p>
          </div>

          <div className="flex items-center gap-2 text-right self-start md:self-auto">
            <span className="text-[48px] md:text-[64px] font-bold leading-none align-middle font-(--font-montserrat) text-white">
              {day}
            </span>
            <div className="flex flex-col items-start leading-none justify-center">
              <span className="text-[10px] font-semibold leading-none align-middle text-white">
                {weekDay}
              </span>
              <span className="text-[15px] font-black leading-none align-middle text-white">
                {month}
              </span>
            </div>
          </div>
        </div>

        <div className="max-w-6xl gap-8 absolute z-30 -bottom-18.25 flex ml-auto right-26 items-end">
          <div className="col-span-12 lg:col-span-3 h-43.25 w-84.25">
            <MyActivitiesChart />
          </div>
          <div className="col-span-12 lg:col-span-3 h-36 w-79.5">
            <TotalLeadsChart />
          </div>
        </div>
      </div>

      {/* Main Content Area (White background) */}
      <div className="bg-dash-bg min-h-screen pt-4.25 md:pt-4.25 pb-16 relative z-10 shadow-inner">
        <div className="max-w-340 mx-auto gap-4.25 flex">
          <TopCustomers />
          <WeeklyTasks />
          <DashboardMap />
          <div className="max-w-34 mt-23.75">
            <CRMPipeline />
            <AIWorkspace />
          </div>
        </div>
      </div>
    </div>
  );
}
