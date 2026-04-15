"use client";

import CustomizeIcon from "@/assets/images/customize-icon.png";
import FileExportIcon from "@/assets/images/file-export-icon.png";
import MessageIcon from "@/assets/images/message-icon.png";
import Image from "next/image";
import { TinyButton } from "../ui/tiny-button";
import type { PayrollAgent } from "./payroll-list";

interface PayrollSidebarProps {
  agent: PayrollAgent | null;
}

const agentDetails = {
  attendanceDays: "18/22",
  baseSalary: "₦65,000",
  zone: "₦15,000",
  commission: "₦25,000",
  phoneNumber: "+234 803 4567890",
  deduction: "₦5,000",
  role: "Field Agent",
  netPay: "₦85,000",
};

export function PayrollSidebar({ agent }: PayrollSidebarProps) {
  if (!agent) return null;

  return (
    <div className="payroll-cutout w-full text-dash-dark h-fit border-dash-dark/5 bg-white p-[55px_42px_46.52px] relative rounded-2xl shadow-[0px_1px_3px_0px_#0000004D,0px_4px_8px_3px_#00000026] ">
      <div className="absolute right-11 top-3.25">
        <TinyButton>View Payroll</TinyButton>
      </div>

      {/* Info grid + photo side by side */}
      <div className="grid grid-cols-[280px_160px]">
        {/* Detail grid */}
        <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <p className="text-[14px] leading-4.5 font-bold text-[#34373C] mb-1">
              Attendance Days
            </p>
            <p className="text-[10px] leading-2.5 font-light text-[#616263]">
              {agentDetails.attendanceDays}
            </p>
          </div>
          <div>
            <p className="text-[14px] leading-4.5 font-bold text-[#34373C] mb-1">
              Base Salary
            </p>
            <p className="text-[10px] leading-2.5 font-light text-[#616263]">
              {agentDetails.baseSalary}
            </p>
          </div>
          <div>
            <p className="text-[14px] leading-4.5 font-bold text-[#34373C] mb-1">
              Zone
            </p>
            <p className="text-[10px] leading-2.5 font-light text-[#616263]">
              {agentDetails.zone}
            </p>
          </div>
          <div>
            <p className="text-[14px] leading-4.5 font-bold text-[#34373C] mb-1">
              Commission
            </p>
            <p className="text-[10px] leading-2.5 font-light text-[#616263]">
              {agentDetails.commission}
            </p>
          </div>
          <div>
            <p className="text-[14px] font-bold text-[#34373C] mb-[4px]">
              Phone Number
            </p>
            <p className="text-[10px] leading-2.5 font-light text-[#616263]">
              {agentDetails.phoneNumber}
            </p>
          </div>
          <div>
            <p className="text-[14px] font-bold text-[#34373C] mb-[4px]">
              Deduction
            </p>
            <p className="text-[10px] leading-2.5 font-light text-[#616263]">
              {agentDetails.deduction}
            </p>
          </div>
          <div>
            <p className="text-[14px] font-bold text-[#34373C] mb-[4px]">
              Role
            </p>
            <p className="text-[10px] leading-2.5 font-light text-[#616263]">
              {agentDetails.role}
            </p>
          </div>
          <div>
            <p className="text-[14px] font-bold text-[#34373C] mb-[4px]">
              Net Pay
            </p>
            <p className="text-[10px] leading-2.5 font-light text-[#616263]">
              {agentDetails.netPay}
            </p>
          </div>
        </div>

        {/* Photo card */}
        <div className="shrink-0 hidden sm:flex flex-col items-center">
          <div className="w-39.75 h-32.5 rounded-[20px] overflow-hidden shadow-lg bg-[#C9A84C]">
            <Image
              src={agent.avatar}
              width={116}
              height={144}
              className="w-full h-full object-cover"
              alt={agent.name}
            />
          </div>
          <div className="flex items-end gap-3 mt-0">
            <div>
              <p className="text-[11px] font-bold text-[#0B1215] mt-2 text-center">
                {agent.name}
              </p>
              <p className="text-[10px] font-light text-[#09232D] text-left">
                {agent.lga} LGA
              </p>
            </div>
            <div className="px-[4.5px] rounded-full py-0.5 text-[6px] h-fit font-medium bg-[#2F6C0E] text-white">
              {agent.status}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-1.75 mt-6.5">
            <button className="w-[32.48px] h-[32.48px] rounded-full bg-[#EAEAEA] flex items-center justify-center cursor-pointer">
              <Image src={MessageIcon} alt="Message" width={14} height={14} />
            </button>
            <button className="w-[32.48px] h-[32.48px] rounded-full bg-[#EAEAEA] flex items-center justify-center cursor-pointer">
              <Image
                src={CustomizeIcon}
                alt="Customize"
                width={14}
                height={14}
              />
            </button>
            <button className="w-[32.48px] h-[32.48px] rounded-full bg-[#EAEAEA] flex items-center justify-center cursor-pointer">
              <Image
                src={FileExportIcon}
                alt="File Export"
                width={14}
                height={14}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
