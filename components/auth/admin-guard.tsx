"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";

const ADMIN_ROLES = ["owner", "admin", "supervisor"];

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    const role = user.active_company?.role;
    if (role && !ADMIN_ROLES.includes(role)) {
      router.replace("/agent/dashboard");
    }
  }, [user, hasHydrated, router]);

  if (!hasHydrated) return null;
  if (!user) return null;
  const role = user.active_company?.role;
  if (role && !ADMIN_ROLES.includes(role)) return null;

  return <>{children}</>;
}
