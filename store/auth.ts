import { create } from "zustand";
import { persist } from "zustand/middleware";

import { ActiveCompany } from "@/lib/api/onboarding";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
  user_type?: string;
  access_role?: string;
  active_company: ActiveCompany | null;
};

type AuthState = {
  user: AuthUser | null;
  setUser: (user: AuthUser) => void;
  clearUser: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      clearUser: () => set({ user: null }),
    }),
    { name: "factory_auth_user" }
  )
);
