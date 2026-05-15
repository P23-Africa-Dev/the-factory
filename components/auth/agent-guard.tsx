"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";

export function AgentGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.active_company?.role !== "agent") {
      router.replace("/admin/dashboard");
    }
  }, [user, router]);

  if (!user) return null;
  if (user.active_company?.role !== "agent") return null;

  return <>{children}</>;
}
