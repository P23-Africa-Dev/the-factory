"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { TinyButton } from "../ui/tiny-button";

const MapView = dynamic(
  () => import("@/components/map/map-view").then((m) => m.MapView),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-72 rounded-[20px] bg-[#F0F0F0] animate-pulse" />
    ),
  },
);

export const DashboardMap = () => {
  return (
    <div className="mt-6 lg:mt-26.5 min-w-0 lg:min-w-lg flex flex-col h-min">
      <div className="flex items-center justify-between px-4.75 mb-4">
        <h3 className="text-[#203B5F] font-medium text-[16px] ">
          Active Field Agents
        </h3>
        <Link href="/map">
          <TinyButton>Open Map</TinyButton>
        </Link>
      </div>
      <div className="w-full h-72 shadow-[0px_2px_3px_0px_#0000004D,0px_6px_10px_4px_#00000026] rounded-[20px] overflow-hidden">
        <MapView compact />
      </div>
    </div>
  );
};
