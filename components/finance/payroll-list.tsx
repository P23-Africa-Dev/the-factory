"use client";

import Image from "next/image";

export interface PayrollAgent {
  id: string;
  name: string;
  address: string;
  avatar: string;
  baseSalary: string;
  netPay: string;
  role: string;
  status: "Pending" | "Approved";
}

const agents: PayrollAgent[] = [
  {
    id: "1",
    name: "Francis Nasyomba",
    address: "13 Oloo Akron Avenue, Ikeja, Nairobi",
    avatar: "https://i.pravatar.cc/150?u=francis1",
    baseSalary: "₦65,000",
    netPay: "₦15,000",
    role: "Field Agent",
    status: "Pending",
  },
  {
    id: "2",
    name: "Lane Wade",
    address: "13 Oloo Akron Avenue, Ikeja, Nairobi",
    avatar: "https://i.pravatar.cc/150?u=lane2",
    baseSalary: "₦65,000",
    netPay: "₦15,000",
    role: "Field Agent",
    status: "Approved",
  },
  {
    id: "3",
    name: "Francis Nasyomba",
    address: "13 Oloo Akron Avenue, Ikeja, Nairobi",
    avatar: "https://i.pravatar.cc/150?u=francis3",
    baseSalary: "₦65,000",
    netPay: "₦15,000",
    role: "Field Agent",
    status: "Pending",
  },
  {
    id: "4",
    name: "Francis Nasyomba",
    address: "13 Oloo Akron Avenue, Ikeja, Nairobi",
    avatar: "https://i.pravatar.cc/150?u=francis4",
    baseSalary: "₦65,000",
    netPay: "₦15,000",
    role: "Field Agent",
    status: "Pending",
  },
  {
    id: "5",
    name: "Francis Nasyomba",
    address: "13 Oloo Akron Avenue, Ikeja, Nairobi",
    avatar: "https://i.pravatar.cc/150?u=francis5",
    baseSalary: "₦65,000",
    netPay: "₦15,000",
    role: "Field Agent",
    status: "Approved",
  },
  {
    id: "6",
    name: "Francis Nasyomba",
    address: "13 Oloo Akron Avenue, Ikeja, Nairobi",
    avatar: "https://i.pravatar.cc/150?u=francis6",
    baseSalary: "₦65,000",
    netPay: "₦15,000",
    role: "Field Agent",
    status: "Pending",
  },
];

interface PayrollListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  showViewAll?: boolean;
}

export function PayrollList({
  selectedId,
  onSelect,
  showViewAll = false,
}: PayrollListProps) {
  const displayedAgents = showViewAll ? agents : agents.slice(0, 3);

  return (
    <div className="bg-white rounded-[30px] p-5 sm:p-6 shadow-sm flex-1 min-w-0">
      {/* Header */}
      {!showViewAll && (
        <div className="flex justify-end mb-4">
          <button className="px-5 py-2 bg-[#0B1215] text-white rounded-full text-[11px] font-semibold hover:opacity-90 transition-colors">
            All Payroll List
          </button>
        </div>
      )}

      {/* Column Headers */}
      <div className="hidden sm:flex items-center gap-3 sm:gap-5 px-3 sm:px-5 mb-2">
        <div className="w-11 sm:w-14 shrink-0" />
        <div className="flex-1 min-w-0 sm:w-40 lg:w-44">
          {/* Name column - no header */}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-gray-400">Base Salary</p>
        </div>
        <div className="flex-1 min-w-0 hidden md:block">
          <p className="text-[11px] font-bold text-gray-400">Net Pay</p>
        </div>
        <div className="flex-1 min-w-0 hidden lg:block">
          <p className="text-[11px] font-bold text-gray-400">Role</p>
        </div>
        <div className="w-[90px] shrink-0" />
      </div>

      {/* Agent Rows */}
      <div className="space-y-3">
        {displayedAgents.map((agent) => {
          const isSelected = selectedId === agent.id;
          return (
            <div
              key={agent.id}
              onClick={() => onSelect(agent.id)}
              className={`flex items-center gap-3 sm:gap-5 rounded-[30px] pr-4 sm:pr-5 overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                isSelected ? "bg-[#0B1215]" : "bg-[#F8F9FA]"
              }`}
            >
              {/* Left accent bar */}
              <div
                className={`w-5 self-stretch shrink-0 rounded-l-[30px] ${
                  isSelected ? "bg-[#3B82F6]" : "bg-[#E5E7EB]"
                }`}
              />

              {/* Avatar */}
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full border-2 border-white shadow-sm overflow-hidden shrink-0 my-3">
                <Image
                  src={agent.avatar}
                  width={56}
                  height={56}
                  className="w-full h-full object-cover"
                  alt={agent.name}
                />
              </div>

              {/* Name + address */}
              <div className="min-w-0 flex-1 sm:flex-none sm:w-40 lg:w-44 py-3">
                <p
                  className={`text-[13px] sm:text-[14px] font-bold truncate ${isSelected ? "text-white" : "text-[#0B1215]"}`}
                >
                  {agent.name}
                </p>
                <p
                  className={`text-[9px] sm:text-[10px] mt-0.5 truncate ${isSelected ? "text-white/40" : "text-gray-400"}`}
                >
                  {agent.address}
                </p>
              </div>

              {/* Base Salary */}
              <div className="hidden sm:block flex-1 min-w-0 py-3">
                <p
                  className={`text-[13px] font-semibold ${isSelected ? "text-white" : "text-[#0B1215]"}`}
                >
                  {agent.baseSalary}
                </p>
              </div>

              {/* Net Pay */}
              <div className="hidden md:block flex-1 min-w-0 py-3">
                <p
                  className={`text-[13px] font-semibold ${isSelected ? "text-white" : "text-[#0B1215]"}`}
                >
                  {agent.netPay}
                </p>
              </div>

              {/* Role */}
              <div className="hidden lg:block flex-1 min-w-0 py-3">
                <p
                  className={`text-[13px] font-semibold ${isSelected ? "text-white" : "text-[#0B1215]"}`}
                >
                  {agent.role}
                </p>
              </div>

              {/* Status Badge */}
              <div className="shrink-0 py-3">
                <span
                  className={`inline-block px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                    agent.status === "Approved"
                      ? "bg-[#4CAF50]/15 text-[#4CAF50]"
                      : "bg-[#FF9800]/15 text-[#FF9800]"
                  }`}
                >
                  {agent.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
