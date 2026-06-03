"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { clearAuthSession } from "@/lib/auth/session";

export function AgentGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user) {
      // Also clear the cookie so the login page server doesn't bounce back here.
      clearAuthSession();
      router.replace("/agent/login");
      return;
    }
    if (user.active_company?.role !== "agent") {
      router.replace("/dashboard");
    }
  }, [user, hasHydrated, router]);

  if (!hasHydrated) return null;
  if (!user) return null;
  if (user.active_company?.role !== "agent") return null;

  return <>{children}</>;
}
