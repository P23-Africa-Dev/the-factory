import React from "react";
import {
  MyActivitiesChart,
  TotalLeadsChart,
} from "@/components/dashboard/dashboard-charts";
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting";
import { TopCustomers } from "@/components/dashboard/dashboard-top-customers";
import {
  WeeklyTasksAgents,
  CRMPipeline,
  AIWorkspace,
} from "@/components/dashboard/dashboard-cards";
import { DashboardMap } from "@/components/dashboard/dashboard-map";
import { getCurrentDateParts } from "@/lib/utils/date";

export default function DashboardPage() {
  const { day, weekDay, month } = getCurrentDateParts();

  return (
    <div className="min-h-full bg-[#09232D] text-white overflow-x-hidden">
      {/* Header Section with Grid Texture */}
      <div className="px-6 md:px-12 pt-24 md:pt-16 pb-20 md:pb-48 lg:pb-32 relative hero-grid">
        <div className="max-w-340 mx-auto w-full relative">
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-10 md:gap-0 relative z-10">
            <DashboardGreeting />

            <div className="flex items-center gap-2 text-right self-start md:self-auto">
              <span
                style={{ fontFamily: "var(--font-montserrat)" }}
                className="text-[48px] md:text-[64px] leading-none align-middle font-(--font-montserrat) text-white"
              >
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

          <div className="hidden md:flex gap-4 lg:gap-8 absolute z-30 -bottom-18.25 right-0 items-end">
            <div className="h-[144px] w-[270px] lg:h-43.25 lg:w-84.25">
              <MyActivitiesChart />
            </div>
            <div className="h-[120px] w-[250px] lg:h-36 lg:w-79.5">
              <TotalLeadsChart />
            </div>
          </div>
        </div>

        {/* Mobile charts - stacked inline */}
        <div className="flex md:hidden flex-col gap-4 mt-6 px-4">
          <div className="h-44">
            <MyActivitiesChart />
          </div>
          <div className="h-36">
            <TotalLeadsChart />
          </div>
        </div>
      </div>

      {/* Main Content Area (White background) */}
      <div className="bg-dash-bg pb-2 pt-6 md:pt-4.25 relative z-10 shadow-inner">
        <div className="max-w-340 mx-auto gap-4.25 flex flex-col lg:flex-row px-4 md:px-6 lg:px-0">
          <TopCustomers />
          <WeeklyTasksAgents />
          <DashboardMap basePath="/agent" />
          <div className="w-full lg:max-w-34 mt-0 lg:mt-23.75">
            <CRMPipeline />
            <AIWorkspace />
          </div>
        </div>
      </div>
    </div>
  );
}
