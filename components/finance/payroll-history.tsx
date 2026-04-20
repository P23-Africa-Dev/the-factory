"use client";

import { StatusBadge } from "../ui/status-badge";

interface PayrollHistoryEntry {
  id: string;
  month: string;
  baseSalary: string;
  netPay: string;
  dueDate: string;
  status: "Pending" | "Approved";
}

const historyData: PayrollHistoryEntry[] = [
  {
    id: "1",
    month: "March",
    baseSalary: "₦65,000",
    netPay: "₦85,000",
    dueDate: "Tue 5th May, 2026",
    status: "Pending",
  },
  {
    id: "2",
    month: "February",
    baseSalary: "₦65,000",
    netPay: "₦85,000",
    dueDate: "Tue 5th May, 2026",
    status: "Approved",
  },
  {
    id: "3",
    month: "January",
    baseSalary: "₦65,000",
    netPay: "₦85,000",
    dueDate: "Tue 5th May, 2026",
    status: "Pending",
  },
];

export function PayrollHistory() {
  return (
    <div className="mt-6">
      <h3 className="text-[16px] font-bold text-[#0B1215] mb-4">
        Payroll History
      </h3>

      <div className="max-h-[420px] overflow-y-auto pr-1 space-y-3">
        {historyData.map((entry) => (
          <div
            key={entry.id}
            className={`rounded-full px-7.25 py-4 border-t border-[#CDCDCD] ${
              entry.status === "Pending" ? "bg-[#FFFFEF]" : "bg-[#E3F4FB]"
            }`}
          >
            <div className="flex gap-4.5">
              <div>
                <p className="text-[14px] font-bold text-[#7A7A7A] mb-1">
                  Month
                </p>
                <p className="text-[10px] font-light text-[#616263]">
                  {entry.month}
                </p>
              </div>
              <div>
                <p className="text-[14px] font-bold text-[#7A7A7A] mb-1">
                  Base Salary
                </p>
                <p className="text-[10px] font-light text-[#616263]">
                  {entry.baseSalary}
                </p>
              </div>
              <div>
                <p className="text-[14px] font-bold text-[#7A7A7A] mb-1">
                  Net Pay
                </p>
                <p className="text-[10px] font-light text-[#616263]">
                  {entry.netPay}
                </p>
              </div>
              <div className="flex flex-1 items-start justify-between">
                <div>
                  <p className="text-[14px] font-bold text-[#7A7A7A] mb-1">
                    Due Date
                  </p>
                  <p className="text-[10px] font-light text-[#616263]">
                    {entry.dueDate}
                  </p>
                </div>
                <StatusBadge className="self-center" status={entry.status} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
