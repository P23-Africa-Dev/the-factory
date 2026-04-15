"use client";

import Image from "next/image";
import { TinyButton } from "../ui/tiny-button";

export interface PayrollAgent {
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

const agents: PayrollAgent[] = [
  {
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
  {
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
  {
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
  {
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
  {
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
  {
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
];

interface PayrollListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  showViewAll?: boolean;
  onShowViewAll?: () => void;
}

export function PayrollList({
  selectedId,
  onSelect,
  showViewAll = false,
  onShowViewAll,
}: PayrollListProps) {
  const displayedAgents = showViewAll ? agents : agents.slice(0, 3);

  return (
    <div className="bg-white rounded-[30px] pt-5.75 px-10 pb-6 flex-1 min-w-0 shadow-[0px_1px_3px_0px_#0000004D,0px_4px_8px_3px_#00000026]">
      {/* Header */}
      {!showViewAll && (
        <div className="flex justify-end mb-7">
          <TinyButton onClick={onShowViewAll}>All Payroll List</TinyButton>
        </div>
      )}

      {/* Agent Rows */}
      <div className="space-y-3.5">
        {displayedAgents.map((agent) => {
          const isSelected = selectedId === agent.id;
          return (
            <div
              key={agent.id}
              onClick={() => onSelect(agent.id)}
              className={`flex border-[#E8E5E5] border-[0.8px] items-center gap-3 sm:gap-5 rounded-[30px] pr-4 sm:pr-5 overflow-hidden cursor-pointer ${
                isSelected ? "bg-[#0B1215]" : "bg-[#F8F9FA]"
              }`}
            >
              {/* Left accent bar */}
              <div
                className={`w-5 self-stretch shrink-0 rounded-l-[30px] ${
                  isSelected ? "" : "bg-[#83C4F8]"
                }`}
              />

              {/* Avatar */}
              <div className="w-14.75 h-14.75 mt-3.5 mb-3 sm:w-14 sm:h-14 rounded-full shadow-sm overflow-hidden shrink-0">
                <Image
                  src={agent.avatar}
                  width={56}
                  height={56}
                  className="w-full h-full object-cover"
                  alt={agent.name}
                />
              </div>

              {/* Name + address */}
              <div className="min-w-0 max-w-35 flex-1 sm:flex-none sm:w-40 lg:w-44 py-3">
                <p
                  className={`text-[13px] sm:text-[14px] font-bold truncate ${isSelected ? "text-white" : "text-[#0B1215]"}`}
                >
                  {agent.name}
                </p>
                <p
                  className={`text-[9px] sm:text-[10px] mt-0.5 ${isSelected ? "text-white" : "text-[#616263]"}`}
                >
                  {agent.address}
                </p>
              </div>

              {/* Base Salary */}
              <div className="hidden sm:block flex-1 min-w-0 py-3 self-baseline">
                <p
                  className={`text-[14px] font-bold ${isSelected ? "text-white" : "text-[#34373C]"}`}
                >
                  Base Salary
                </p>
                <p
                  className={`text-[10px] font-light ${isSelected ? "text-[#E8E8E8]" : "text-[#616263]"}`}
                >
                  {agent.baseSalary}
                </p>
              </div>

              {/* Net Pay */}
              <div className="hidden md:block flex-1 min-w-0 py-3 self-baseline">
                <p
                  className={`text-[14px] font-bold ${isSelected ? "text-white" : "text-[#34373C]"}`}
                >
                  Net Pay
                </p>
                <p
                  className={`text-[10px] font-light ${isSelected ? "text-[#E8E8E8]" : "text-[#616263]"}`}
                >
                  {agent.netPay}
                </p>
              </div>

              {/* Role */}
              <div className="hidden lg:block flex-1 min-w-0 py-3 self-baseline">
                <p
                  className={`text-[14px] font-bold ${isSelected ? "text-white" : "text-[#34373C]"}`}
                >
                  Role
                </p>
                <p
                  className={`text-[10px] font-light ${isSelected ? "text-[#E8E8E8]" : "text-[#616263]"}`}
                >
                  {agent.role}
                </p>
              </div>

              {/* Status Badge */}
              <div className="shrink-0 py-3 self-baseline">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] text-white font-medium whitespace-nowrap ${
                    agent.status === "Approved"
                      ? "bg-[#2F6C0E]"
                      : "bg-[#EF7129]"
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
