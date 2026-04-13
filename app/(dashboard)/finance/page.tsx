"use client";

import { useState } from "react";
import { Search, Download, SlidersHorizontal } from "lucide-react";
import { PaymentOverview } from "@/components/finance/payment-overview";
import { PayrollList } from "@/components/finance/payroll-list";
import { PayrollSidebar } from "@/components/finance/payroll-sidebar";
import { PayrollHistory } from "@/components/finance/payroll-history";
import { SetPayrollModal } from "@/components/finance/set-payroll-modal";

const agentsMap: Record<
  string,
  {
    id: string;
    name: string;
    address: string;
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
  const [searchQuery, setSearchQuery] = useState("");

  const selectedAgent = selectedAgentId
    ? (agentsMap[selectedAgentId] ?? null)
    : null;

  return (
    <div className="min-h-full bg-[#F4F7F9]">
      {/* Main Content */}
      <div className="px-5 sm:px-8 lg:px-10 py-6 space-y-6">
        {/* Payment Overview Section */}
        {!showViewAll && <PaymentOverview />}

        {/* Payroll List + Sidebar */}
        <div className="flex flex-col xl:flex-row gap-6">
          {/* List */}
          <div className="flex-1 min-w-0">
            {showViewAll && (
              <div className="flex justify-between items-center mb-4">
                <button
                  onClick={() => setShowViewAll(false)}
                  className="text-[12px] font-semibold text-gray-500 hover:text-[#0B1215] transition-colors cursor-pointer"
                >
                  &larr; Back
                </button>
                <button className="px-5 py-2 bg-[#0B1215] text-white rounded-full text-[11px] font-semibold hover:opacity-90 transition-colors cursor-pointer">
                  View Payroll
                </button>
              </div>
            )}

            <PayrollList
              selectedId={selectedAgentId}
              onSelect={setSelectedAgentId}
              showViewAll={showViewAll}
            />

            {!showViewAll && (
              <div className="flex justify-center mt-4">
                <button
                  onClick={() => setShowViewAll(true)}
                  className="text-[11px] font-semibold text-gray-400 hover:text-[#0B1215] transition-colors cursor-pointer"
                >
                  View All
                </button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-full xl:w-85 xl:shrink-0">
            <PayrollSidebar agent={selectedAgent} />

            {/* Payroll History - shown when a user is selected */}
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
