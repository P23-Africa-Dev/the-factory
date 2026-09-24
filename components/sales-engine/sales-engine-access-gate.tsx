"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  useSalesEngineAccess,
  type SalesEngineAccessResult,
} from "@/hooks/use-sales-engine-auth";
import type { SalesEngineAccessState } from "@/lib/api/sales-engine";

type Props = {
  state: Exclude<SalesEngineAccessState, "ready">;
  message?: string;
  onRequestAccess: () => Promise<void>;
  onLoginLink: (email: string, password: string) => Promise<void>;
  isRequesting: boolean;
  isLoggingIn: boolean;
};

function gateCopy(state: Props["state"], message?: string): {
  title: string;
  body: string;
  showRequest: boolean;
} {
  if (state === "pending") {
    return {
      title: "Access Request Pending",
      body: "Your request to access Sales Engine is being reviewed. You will be able to enter once it is approved.",
      showRequest: false,
    };
  }
  if (state === "declined") {
    return {
      title: "Access Not Available",
      body: "Your request to access Sales Engine was declined. If you already have a Sales Engine account, log in below. Otherwise contact your administrator.",
      showRequest: false,
    };
  }
  if (state === "error") {
    return {
      title: "Access Not Available",
      body:
        message ||
        "We could not verify Sales Engine access right now. Please try again, or log in with your Sales Engine account.",
      showRequest: true,
    };
  }
  return {
    title: "Access Not Available",
    body: "This feature is currently unavailable on your subscription plan. To request access or learn about available plans, click on the request access botton below.",
    showRequest: true,
  };
}

export function SalesEngineAccessGate({
  state,
  message,
  onRequestAccess,
  onLoginLink,
  isRequesting,
  isLoggingIn,
}: Props) {
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const copy = gateCopy(state, message);

  const handleRequest = async () => {
    try {
      await onRequestAccess();
      toast.success("Access request sent. We will notify operations.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit request.");
    }
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await onLoginLink(email.trim(), password);
      toast.success("Sales Engine account linked. Opening…");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed.");
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-[#f8f8f8] px-6 py-12 text-[#09232d]">
      <div className="w-full max-w-lg text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b7c84]">
          Sales Engine
        </p>
        <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
          {copy.title}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-[#3d525a]">
          {copy.body}
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          {copy.showRequest && (
            <button
              type="button"
              onClick={handleRequest}
              disabled={isRequesting}
              className="inline-flex h-11 min-w-[200px] items-center justify-center rounded-xl bg-[#09232d] px-6 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-[#0c2f3c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRequesting ? "Sending…" : "Request Access"}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowLogin((open) => !open)}
            className="text-sm font-medium text-[#0c5c6e] underline-offset-2 hover:underline"
          >
            {showLogin ? "Hide login" : "Log in if you already have an account"}
          </button>
        </div>

        {showLogin && (
          <form
            onSubmit={handleLogin}
            className="mx-auto mt-6 w-full max-w-sm rounded-2xl border border-[#d8dee1] bg-white p-5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <label className="block text-xs font-semibold uppercase tracking-wide text-[#6b7c84]">
              Sales Engine email
            </label>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-[#cfd6da] bg-white px-3 text-sm outline-none focus:border-[#09232d]"
            />
            <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-[#6b7c84]">
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-[#cfd6da] bg-white px-3 text-sm outline-none focus:border-[#09232d]"
            />
            <button
              type="submit"
              disabled={isLoggingIn}
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-[#09232d] bg-white text-sm font-semibold text-[#09232d] transition hover:bg-[#f3f6f7] disabled:opacity-60"
            >
              {isLoggingIn ? "Signing in…" : "Sign in to Sales Engine"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/** Wrapper used by the sales-engine page: resolves access then renders children or the gate. */
export function SalesEngineAccessShell({ children }: { children: ReactNode }) {
  const { data, isLoading, isFetching, requestAccess, loginLink, refetch } =
    useSalesEngineAccess();

  if (isLoading || (!data && isFetching)) {
    return (
      <div className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-[#f8f8f8] text-sm text-[#3d525a]">
        Checking Sales Engine access…
      </div>
    );
  }

  const result: SalesEngineAccessResult = data ?? {
    state: "error",
    token: null,
    message: "Could not resolve Sales Engine access.",
  };

  if (result.state === "ready") {
    return <>{children}</>;
  }

  return (
    <SalesEngineAccessGate
      state={result.state}
      message={result.message}
      isRequesting={requestAccess.isPending}
      isLoggingIn={loginLink.isPending}
      onRequestAccess={async () => {
        await requestAccess.mutateAsync();
        await refetch();
      }}
      onLoginLink={async (email, password) => {
        await loginLink.mutateAsync({ email, password });
      }}
    />
  );
}
