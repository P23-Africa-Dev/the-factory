"use client";

import CalendarIcon from "@/assets/images/calendar-icon.png";
import CardValidationIcon from "@/assets/images/card-validation-icon.png";
import FileExportIcon from "@/assets/images/file-export-icon.png";
import { PaymentOverview } from "@/components/payroll/payment-overview";
import { agents, PayrollList } from "@/components/payroll/payroll-list";
import { PayrollSidebar } from "@/components/payroll/payroll-sidebar";
import { SetPayrollModal } from "@/components/payroll/set-payroll-modal";
import { Search, SlidersHorizontal } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function FinancePage() {
  const router = useRouter();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>("2");
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);

  const selectedAgent = selectedAgentId
    ? (agents.find((a) => a.id === selectedAgentId) ?? null)
    : null;

  return (
    <div className="h-full">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mx-5 sm:mx-8 lg:mx-[53.5px] mt-5.75">
        <div className="relative w-full max-w-114">
          <Search
            className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search for leads"
            className="w-full bg-white border border-gray-200 rounded-full py-3.5 pl-13 pr-6 text-[13px] outline-none focus:ring-2 focus:ring-dash-teal/20 transition-all shadow-[0px_1px_3px_0px_#0000004D,0px_4px_8px_3px_#00000026]"
          />
        </div>

        <div className="flex items-center gap-4.25 flex-wrap">
          <button className="flex items-center gap-2 px-2.5 py-[8.5px] border border-gray-200 rounded-[10px] text-[10px] text-gray-500 transition-all">
            <Image
              src={CalendarIcon}
              alt="Calendar Icon"
              width={13}
              height={13}
            />
            April 16, 2026
          </button>
          <button className="flex items-center gap-2 px-2.5 py-[8.5px] border border-gray-200 rounded-[10px] text-[10px] text-gray-500 transition-all">
            <Image
              src={FileExportIcon}
              alt="Export Icon"
              width={13}
              height={13}
              style={{ filter: "invert(40%) sepia(0%) grayscale(100%)" }}
            />
            Export
          </button>
          <button className="flex items-center gap-2 px-2.5 py-[8.5px] border border-gray-200 rounded-[10px] text-[10px] text-gray-500 transition-all">
            <SlidersHorizontal size={13} />
            Filter
          </button>
          <button
            onClick={() => setIsPayrollModalOpen(true)}
            className="flex items-center gap-2.5 px-2.5 py-[8.5px] font-medium bg-[#09232D] text-white rounded-[10px] text-[10px] hover:opacity-90 transition-all"
          >
            Set Payroll
            <Image
              src={CardValidationIcon}
              alt="Set Payroll Icon"
              width={13}
              height={13}
            />
          </button>
        </div>
      </div>
      {/* Main Content */}
      <div className="px-5 sm:px-8 lg:px-10 py-6 space-y-6">
        <PaymentOverview />

        {/* Payroll List + Sidebar */}
        <div className="flex flex-col xl:flex-row gap-6">
          <div className="flex-1 min-w-0">
            <PayrollList
              selectedId={selectedAgentId}
              onSelect={setSelectedAgentId}
              onShowViewAll={() => router.push("/payroll/payroll-list")}
            />
          </div>

          <div className="w-full xl:w-85 xl:shrink-0 xl:min-w-131.25">
            <div className="drop-shadow-[0px_1px_3px_#0000004D,0px_4px_8px_#00000026]">
              <PayrollSidebar agent={selectedAgent} />
            </div>
          </div>
        </div>
      </div>

      {/* Set Payroll Modal */}
      <SetPayrollModal
        isOpen={isPayrollModalOpen}
        onClose={() => setIsPayrollModalOpen(false)}
      />
    </div>
  );
}
