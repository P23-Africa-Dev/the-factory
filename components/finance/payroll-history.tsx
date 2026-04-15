"use client";

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
    status: "Pending",
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

      <div className="space-y-3">
        {historyData.map((entry) => (
          <div key={entry.id} className="bg-[#F8F9FA] rounded-[16px] px-5 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-[10px] font-bold text-gray-400 mb-0.5">
                  Month
                </p>
                <p className="text-[12px] font-semibold text-[#0B1215]">
                  {entry.month}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 mb-0.5">
                  Base Salary
                </p>
                <p className="text-[12px] font-semibold text-[#0B1215]">
                  {entry.baseSalary}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 mb-0.5">
                  Net Pay
                </p>
                <p className="text-[12px] font-semibold text-[#0B1215]">
                  {entry.netPay}
                </p>
              </div>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 mb-0.5">
                    Due Date
                  </p>
                  <p className="text-[12px] font-semibold text-[#0B1215]">
                    {entry.dueDate}
                  </p>
                </div>
                <span
                  className={`inline-block px-2.5 py-1 rounded-full text-[9px] font-bold whitespace-nowrap ${
                    entry.status === "Approved"
                      ? "bg-[#4CAF50]/15 text-[#4CAF50]"
                      : "bg-[#FF9800]/15 text-[#FF9800]"
                  }`}
                >
                  {entry.status}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
