"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useMapCredits } from "@/hooks/use-map-credits";

const MANAGEMENT_ROLES = new Set(["owner", "admin", "supervisor"]);

export function MapCreditBadge() {
  const user = useAuthStore((s) => s.user);
  const { role, apiCompanyId: companyId } = getActiveCompanyContext(user);
  const isManagement = role != null && MANAGEMENT_ROLES.has(role);

  const { data } = useMapCredits(companyId ?? undefined, {
    enabled: isManagement,
    refetchInterval: 60_000,
  });

  // Hidden for agents, and when the org isn't metered (demo / enforcement off).
  if (!isManagement || !data || !data.metered) return null;

  const balance = data.balance;
  const exhausted = balance <= 0;
  const tone = exhausted
    ? "bg-red-500/15 text-red-300 hover:bg-red-500/25"
    : data.low
      ? "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
      : "bg-white/5 text-white/70 hover:bg-white/10";

  return (
    <Link
      href="/settings/map-credits"
      title="Map credits"
      className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${tone}`}
    >
      <Coins size={14} />
      {balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
    </Link>
  );
}
