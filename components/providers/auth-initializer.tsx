"use client";

import { useEffect } from "react";
import { getMe } from "@/lib/api/onboarding";
import {
  handleAccountAccessDenied,
  isAccountStatusCode,
} from "@/lib/auth/account-status";
import { clearAuthSession, getAuthTokenFromDocument, setCompanyId } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth";

export default function AuthInitializer({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, setUser, clearUser } = useAuthStore();

  useEffect(() => {
    const token = getAuthTokenFromDocument();

    if (token) {
      getMe(token)
        .then((res) => {
          if (res.success) {
            if (res.data.active_company?.id) {
              setCompanyId(res.data.active_company.id);
            }
            setUser({
              ...user, // Merge with existing state (preserved from persistence)
              id: res.data.id,
              name: res.data.name,
              email: res.data.email,
              avatar: res.data.avatar,
              active_company: res.data.active_company,
            });
          }
        })
        .catch((err) => {
          if (process.env.NODE_ENV !== "production") {
            console.warn("Failed to fetch user profile", {
              status: err?.status,
              message: err?.message,
            });
          }

          if (err?.status === 403 && isAccountStatusCode(err?.code)) {
            handleAccountAccessDenied(err.message, { accountStatus: err.code });
            return;
          }

          // If token is invalid (401), clear session
          if (err.status === 401) {
            clearAuthSession();
            clearUser();
          }
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on refresh/mount

  return <>{children}</>;
}
