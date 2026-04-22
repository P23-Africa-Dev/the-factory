"use client";

import { useEffect } from "react";
import { getMe } from "@/lib/api/onboarding";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
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
          console.error("Failed to fetch user profile:", err);
          // If token is invalid (401), clear session
          if (err.status === 401) {
            clearUser();
          }
        });
    }
  }, []); // Run once on refresh/mount

  return <>{children}</>;
}
