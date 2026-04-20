"use client";

interface StatusBadgeProps {
  status: "Pending" | "Approved";
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] text-white font-medium whitespace-nowrap ${
        status === "Approved" ? "bg-[#2F6C0E]" : "bg-[#EF7129]"
      } ${className}`}
    >
      {status}
    </span>
  );
}
