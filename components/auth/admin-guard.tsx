"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";

const ADMIN_ROLES = ["owner", "admin", "supervisor"];

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
    const role = user.active_company?.role;
    if (role && !ADMIN_ROLES.includes(role)) {
      router.replace("/agent/dashboard");
    }
  }, [user, router]);

  if (!user) return null;
  const role = user.active_company?.role;
  if (role && !ADMIN_ROLES.includes(role)) return null;

  return <>{children}</>;
}
