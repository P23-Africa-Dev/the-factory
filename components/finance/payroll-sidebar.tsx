'use client';

import Image from 'next/image';
import { MessageSquare, Map, Plus } from 'lucide-react';
import type { PayrollAgent } from './payroll-list';

interface PayrollSidebarProps {
  agent: PayrollAgent | null;
}

const agentDetails = {
  attendanceDays: '18/22',
  baseSalary: '₦65,000',
  zone: '₦15,000',
  commission: '₦25,000',
  phoneNumber: '+234 803 4567890',
  deduction: '₦5,000',
  role: 'Field Agent',
  netPay: '₦85,000',
};

export function PayrollSidebar({ agent }: PayrollSidebarProps) {
  if (!agent) return null;

  return (
    <div className="w-full">
      {/* View Payroll button */}
      <div className="flex justify-end mb-4">
        <button className="px-5 py-2 bg-[#0B1215] text-white rounded-full text-[11px] font-semibold hover:opacity-90 transition-colors cursor-pointer">
          View Payroll
        </button>
      </div>

      {/* Info grid + photo side by side */}
      <div className="flex gap-5">
        {/* Detail grid */}
        <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <p className="text-[10px] font-bold text-gray-400 mb-0.5">Attendance Days</p>
            <p className="text-[13px] font-semibold text-[#0B1215]">{agentDetails.attendanceDays}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 mb-0.5">Base Salary</p>
            <p className="text-[13px] font-semibold text-[#0B1215]">{agentDetails.baseSalary}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 mb-0.5">Zone</p>
            <p className="text-[13px] font-semibold text-[#0B1215]">{agentDetails.zone}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 mb-0.5">Commission</p>
            <p className="text-[13px] font-semibold text-[#0B1215]">{agentDetails.commission}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 mb-0.5">Phone Number</p>
            <p className="text-[13px] font-semibold text-[#0B1215]">{agentDetails.phoneNumber}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 mb-0.5">Deduction</p>
            <p className="text-[13px] font-semibold text-[#0B1215]">{agentDetails.deduction}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 mb-0.5">Role</p>
            <p className="text-[13px] font-semibold text-[#0B1215]">{agentDetails.role}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 mb-0.5">Net Pay</p>
            <p className="text-[13px] font-semibold text-[#0B1215]">{agentDetails.netPay}</p>
          </div>
        </div>

        {/* Photo card */}
        <div className="shrink-0 hidden sm:flex flex-col items-center">
          <div className="w-[116px] h-[144px] rounded-[20px] overflow-hidden shadow-lg bg-[#C9A84C]">
            <Image
              src={agent.avatar}
              width={116}
              height={144}
              className="w-full h-full object-cover"
              alt={agent.name}
            />
          </div>
          <p className="text-[11px] font-bold text-[#0B1215] mt-2 text-center">{agent.name}</p>
          <span
            className={`mt-1 inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
              agent.status === 'Approved'
                ? 'bg-[#4CAF50]/15 text-[#4CAF50]'
                : 'bg-[#FF9800]/15 text-[#FF9800]'
            }`}
          >
            {agent.status}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-3 mt-4">
        <button className="w-9 h-9 rounded-full bg-white border border-gray-100 shadow-sm flex items-center justify-center text-gray-400 hover:text-[#0B1215] hover:bg-gray-50 transition-colors cursor-pointer">
          <MessageSquare size={14} />
        </button>
        <button className="w-9 h-9 rounded-full bg-white border border-gray-100 shadow-sm flex items-center justify-center text-gray-400 hover:text-[#0B1215] hover:bg-gray-50 transition-colors cursor-pointer">
          <Map size={14} />
        </button>
        <button className="w-9 h-9 rounded-full bg-white border border-gray-100 shadow-sm flex items-center justify-center text-gray-400 hover:text-[#0B1215] hover:bg-gray-50 transition-colors cursor-pointer">
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
