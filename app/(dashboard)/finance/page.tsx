"use client";

import CalendarIcon from "@/assets/images/calendar-icon.png";
import FileExportIcon from "@/assets/images/file-export-icon.png";
import CardValidationIcon from "@/assets/images/card-validation-icon.png";
import { PaymentOverview } from "@/components/finance/payment-overview";
import { PayrollHistory } from "@/components/finance/payroll-history";
import { PayrollList } from "@/components/finance/payroll-list";
import { PayrollSidebar } from "@/components/finance/payroll-sidebar";
import { SetPayrollModal } from "@/components/finance/set-payroll-modal";
import { Search, SlidersHorizontal } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

const agentsMap: Record<
  string,
  {
    id: string;
    name: string;
    address: string;
    lga: string;
    avatar: string;
    baseSalary: string;
    netPay: string;
    role: string;
    status: "Pending" | "Approved";
  }
> = {
  "1": {
    id: "1",
    name: "Francis Nasyomba",
    address: "13 Oloo Akron Avenue, Ikeja, Nairobi",
    lga: "Ikeja",
    avatar: "https://i.pravatar.cc/150?u=francis1",
    baseSalary: "₦65,000",
    netPay: "₦15,000",
    role: "Field Agent",
    status: "Pending",
  },
  "2": {
    id: "2",
    name: "Lane Wade",
    address: "13 Oloo Akron Avenue, Ikeja, Nairobi",
    lga: "Ikeja",
    avatar: "https://i.pravatar.cc/150?u=lane2",
    baseSalary: "₦65,000",
    netPay: "₦15,000",
    role: "Field Agent",
    status: "Approved",
  },
  "3": {
    id: "3",
    name: "Francis Nasyomba",
    address: "13 Oloo Akron Avenue, Ikeja, Nairobi",
    lga: "Ikeja",
    avatar: "https://i.pravatar.cc/150?u=francis3",
    baseSalary: "₦65,000",
    netPay: "₦15,000",
    role: "Field Agent",
    status: "Pending",
  },
  "4": {
    id: "4",
    name: "Francis Nasyomba",
    address: "13 Oloo Akron Avenue, Ikeja, Nairobi",
    lga: "Ikeja",
    avatar: "https://i.pravatar.cc/150?u=francis4",
    baseSalary: "₦65,000",
    netPay: "₦15,000",
    role: "Field Agent",
    status: "Pending",
  },
  "5": {
    id: "5",
    name: "Francis Nasyomba",
    address: "13 Oloo Akron Avenue, Ikeja, Nairobi",
    lga: "Ikeja",
    avatar: "https://i.pravatar.cc/150?u=francis5",
    baseSalary: "₦65,000",
    netPay: "₦15,000",
    role: "Field Agent",
    status: "Approved",
  },
  "6": {
    id: "6",
    name: "Francis Nasyomba",
    address: "13 Oloo Akron Avenue, Ikeja, Nairobi",
    lga: "Ikeja",
    avatar: "https://i.pravatar.cc/150?u=francis6",
    baseSalary: "₦65,000",
    netPay: "₦15,000",
    role: "Field Agent",
    status: "Pending",
  },
};

export default function FinancePage() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>("2");
  const [showViewAll, setShowViewAll] = useState(false);
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);

  const selectedAgent = selectedAgentId
    ? (agentsMap[selectedAgentId] ?? null)
    : null;

  return (
    <div className="h-full">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mx-[53.5px] mt-5.75">
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
          <button className="flex items-center gap-2.5 px-2.5 py-[8.5px] font-medium bg-[#09232D] text-white rounded-[10px] text-[10px] hover:opacity-90 transition-all">
            Set Payroll
            <Image
              src={CardValidationIcon}
              alt="Set Payroll Icon"
              width={13}
              height={13}
              onClick={() => setIsPayrollModalOpen(true)}
            />
          </button>
        </div>
      </div>
      {/* Main Content */}
      <div className="px-5 sm:px-8 lg:px-10 py-6 space-y-6">
        {!showViewAll && <PaymentOverview />}

        {/* Payroll List + Sidebar */}
        <div className="flex flex-col xl:flex-row gap-6">
          <div className="flex-1 min-w-0">
            <PayrollList
              selectedId={selectedAgentId}
              onSelect={setSelectedAgentId}
              showViewAll={showViewAll}
              onShowViewAll={() => setShowViewAll(true)}
            />
          </div>

          <div className="w-full xl:w-85 xl:shrink-0 min-w-131.25">
            <div className="drop-shadow-[0px_1px_3px_#0000004D,0px_4px_8px_#00000026]">
              <PayrollSidebar agent={selectedAgent} />
            </div>

            {showViewAll && selectedAgent && <PayrollHistory />}
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
