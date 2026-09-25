"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Zap,
  Radio,
  Building2,
} from "lucide-react";
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
  onRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
};

type GateConfig = {
  badge: {
    label: string;
    variant: "info" | "amber" | "rose" | "slate";
  };
  title: string;
  body: string;
  showRequest: boolean;
};

function getGateConfig(state: Props["state"], message?: string): GateConfig {
  if (state === "pending") {
    return {
      badge: {
        label: "Request In Review",
        variant: "amber",
      },
      title: "Access Request Pending",
      body: "Your request to access Sales Engine is currently being reviewed by your operations team. You will be able to enter immediately once approved.",
      showRequest: false,
    };
  }
  if (state === "declined") {
    return {
      badge: {
        label: "Access Restricted",
        variant: "rose",
      },
      title: "Access Not Available",
      body: "Your request to access Sales Engine was declined. If you already have dedicated Sales Engine credentials, you can link them below, or contact your administrator.",
      showRequest: false,
    };
  }
  if (state === "error") {
    return {
      badge: {
        label: "Verification Notice",
        variant: "slate",
      },
      title: "Access Verification Failed",
      body:
        message ||
        "We could not verify your Sales Engine access right now. Please try again, or log in with your dedicated Sales Engine account.",
      showRequest: true,
    };
  }
  return {
    badge: {
      label: "Sales Intelligence",
      variant: "info",
    },
    title: "Access Not Available",
    body: "This feature is currently unavailable on your subscription plan. To request access or learn about available plans, click on the request access button below.",
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
  onRefresh,
  isRefreshing = false,
}: Props) {
  const [showLogin, setShowLogin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const config = getGateConfig(state, message);

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
    <div className="relative flex min-h-[calc(100vh-80px)] w-full items-center justify-center overflow-hidden bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-[#eef2f6] px-4 py-12 text-[#09232d]">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[450px] w-[450px] rounded-full bg-[#4fd1c5]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[450px] w-[450px] rounded-full bg-[#09232d]/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />

      <div className="relative z-10 w-full max-w-xl">
        {/* Main Glassmorphic Card */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 p-7 sm:p-10 text-center shadow-[0_25px_60px_-15px_rgba(9,35,45,0.08),0_2px_8px_rgba(0,0,0,0.04)] backdrop-blur-md">
          {/* Subtle top card highlight */}
          <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />

          {/* Status Badge Pill */}
          <div className="flex items-center justify-center">
            {config.badge.variant === "amber" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/90 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-amber-800 shadow-2xs">
                <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                {config.badge.label}
              </span>
            )}
            {config.badge.variant === "rose" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/80 bg-rose-50/90 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-rose-700 shadow-2xs">
                <ShieldAlert className="size-3.5 text-rose-600" />
                {config.badge.label}
              </span>
            )}
            {config.badge.variant === "info" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#09232d]/10 bg-[#09232d]/5 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-[#09232d] shadow-2xs">
                <Sparkles className="size-3.5 text-[#0c5c6e]" />
                {config.badge.label}
              </span>
            )}
            {config.badge.variant === "slate" && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-100 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-slate-700 shadow-2xs">
                <AlertCircle className="size-3.5 text-slate-600" />
                {config.badge.label}
              </span>
            )}
          </div>

          {/* Hero Icon */}
          <div className="relative mx-auto mt-6 mb-5 flex size-20 items-center justify-center rounded-2xl">
            {state === "declined" && (
              <div className="flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-slate-900 text-white shadow-xl shadow-rose-950/20 ring-8 ring-rose-50">
                <Lock className="size-9 text-white stroke-[1.8]" />
              </div>
            )}
            {state === "pending" && (
              <div className="flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-xl shadow-amber-600/20 ring-8 ring-amber-50">
                <Clock className="size-9 text-white stroke-[1.8]" />
              </div>
            )}
            {state === "error" && (
              <div className="flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-xl shadow-slate-900/20 ring-8 ring-slate-100">
                <AlertCircle className="size-9 text-amber-300 stroke-[1.8]" />
              </div>
            )}
            {state === "needs_access" && (
              <div className="flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#09232d] to-[#1a4454] text-white shadow-xl shadow-[#09232d]/25 ring-8 ring-slate-100">
                <Sparkles className="size-9 text-[#4fd1c5] stroke-[1.8]" />
              </div>
            )}
          </div>

          {/* Headline & Body */}
          <h1 className="text-2xl font-bold tracking-tight text-[#09232d] sm:text-3xl">
            {config.title}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[14.5px] leading-relaxed text-slate-600">
            {config.body}
          </p>

          {/* State-specific contextual info widgets */}
          {state === "declined" && (
            <div className="mt-6 rounded-2xl border border-rose-100 bg-rose-50/50 p-4 text-left">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0 rounded-lg bg-rose-100 p-1.5 text-rose-700">
                  <ShieldAlert className="size-4" />
                </div>
                <div className="space-y-1 text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">Why is access restricted?</p>
                  <p className="leading-relaxed text-slate-600">
                    Sales Engine seat allocations and permissions are managed by your team administrator.
                    If your daily workflow requires prospecting or outreach tools, contact your team lead
                    to request permission adjustment.
                  </p>
                </div>
              </div>
            </div>
          )}

          {state === "pending" && (
            <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 text-left">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Approval Progress
              </p>
              <div className="space-y-3">
                {/* Step 1 */}
                <div className="flex items-center gap-3">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-2xs">
                    <CheckCircle2 className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900">Request Submitted</p>
                    <p className="text-[11px] text-slate-500">Dispatched to operations review queue</p>
                  </div>
                  <span className="rounded-full border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    Completed
                  </span>
                </div>

                {/* Step 2 */}
                <div className="flex items-center gap-3">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-2xs">
                    <Clock className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900">Administrator Review</p>
                    <p className="text-[11px] text-slate-500">Seat provisioning & role verification</p>
                  </div>
                  <span className="flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                    <span className="size-1.5 rounded-full bg-amber-500 animate-ping" />
                    In Review
                  </span>
                </div>

                {/* Step 3 */}
                <div className="flex items-center gap-3 opacity-60">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
                    <Sparkles className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-700">Workspace Activation</p>
                    <p className="text-[11px] text-slate-500">Instant unlock of search and outreach</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                    Pending
                  </span>
                </div>
              </div>
            </div>
          )}

          {state === "needs_access" && (
            <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-left">
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                What you unlock with Sales Engine
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200/70 bg-white p-3 shadow-2xs">
                  <Zap className="mb-1.5 size-4 text-[#0c5c6e]" />
                  <p className="text-xs font-semibold text-slate-900">AI Prospecting</p>
                  <p className="mt-0.5 text-[11px] leading-tight text-slate-500">
                    Find verified decision-makers matching your exact ICP
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/70 bg-white p-3 shadow-2xs">
                  <Radio className="mb-1.5 size-4 text-[#0c5c6e]" />
                  <p className="text-xs font-semibold text-slate-900">Social Signals</p>
                  <p className="mt-0.5 text-[11px] leading-tight text-slate-500">
                    Monitor live buying intent across social & web channels
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200/70 bg-white p-3 shadow-2xs">
                  <Building2 className="mb-1.5 size-4 text-[#0c5c6e]" />
                  <p className="text-xs font-semibold text-slate-900">CRM Enrichment</p>
                  <p className="mt-0.5 text-[11px] leading-tight text-slate-500">
                    1-click lead push directly into your active CRM pipeline
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Primary Action Buttons */}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {config.showRequest && (
              <button
                type="button"
                onClick={handleRequest}
                disabled={isRequesting}
                className="inline-flex h-11 min-w-[200px] items-center justify-center gap-2 rounded-xl bg-[#09232d] px-6 text-sm font-semibold tracking-wide text-white shadow-md shadow-[#09232d]/20 transition-all hover:bg-[#0c2f3c] hover:shadow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRequesting ? (
                  <>
                    <Loader2 className="size-4 animate-spin text-white" />
                    Sending Request…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4 text-[#4fd1c5]" />
                    Request Access
                  </>
                )}
              </button>
            )}

            {state === "pending" && onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-[#09232d] shadow-2xs transition-all hover:bg-slate-50 active:scale-[0.98] disabled:opacity-60"
              >
                <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin text-[#0c5c6e]" : "text-slate-600"}`} />
                {isRefreshing ? "Checking Status…" : "Refresh Status"}
              </button>
            )}

            {state === "declined" && (
              <a
                href="mailto:support@thefactory23.com?subject=Sales%20Engine%20Access%20Inquiry"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#09232d] px-6 text-sm font-semibold text-white shadow-md shadow-[#09232d]/20 transition-all hover:bg-[#0c2f3c] active:scale-[0.98]"
              >
                <Mail className="size-4 text-white" />
                Contact Administrator
              </a>
            )}

            {state === "error" && onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#09232d] px-6 text-sm font-semibold text-white shadow-md transition-all hover:bg-[#0c2f3c] active:scale-[0.98] disabled:opacity-60"
              >
                <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin text-white" : "text-white"}`} />
                {isRefreshing ? "Retrying…" : "Retry Verification"}
              </button>
            )}
          </div>

          {/* Account Linking Collapsible Accordion */}
          <div className="mt-8 border-t border-slate-100 pt-6">
            <button
              type="button"
              onClick={() => setShowLogin((open) => !open)}
              className="group inline-flex items-center gap-2 text-xs font-medium text-slate-500 transition-colors hover:text-[#09232d]"
              aria-expanded={showLogin}
            >
              <KeyRound className="size-3.5 text-[#0c5c6e] transition-transform group-hover:scale-110" />
              <span>
                {showLogin ? "Hide credentials login" : "Already have a Sales Engine account? Sign in"}
              </span>
              <ChevronDown
                className={`size-3.5 transition-transform duration-200 ${
                  showLogin ? "rotate-180 text-[#09232d]" : ""
                }`}
              />
            </button>

            {showLogin && (
              <form
                onSubmit={handleLogin}
                className="mx-auto mt-4 w-full max-w-md rounded-2xl border border-slate-200/90 bg-slate-50/70 p-5 text-left shadow-2xs transition-all"
              >
                <div className="mb-4">
                  <p className="text-xs font-semibold text-slate-900">
                    Link Existing Credentials
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Authenticate with your Sales Engine credentials to connect access to this workspace.
                  </p>
                </div>

                <div className="space-y-3.5">
                  <div>
                    <label
                      htmlFor="se-email"
                      className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600"
                    >
                      Sales Engine Email
                    </label>
                    <div className="relative mt-1">
                      <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="se-email"
                        type="email"
                        required
                        autoComplete="username"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-9 text-xs font-normal text-slate-900 outline-none transition focus:border-[#09232d] focus:ring-2 focus:ring-[#09232d]/10"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="se-password"
                      className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600"
                    >
                      Password
                    </label>
                    <div className="relative mt-1">
                      <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="se-password"
                        type={showPassword ? "text" : "password"}
                        required
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white pr-10 pl-9 text-xs font-normal text-slate-900 outline-none transition focus:border-[#09232d] focus:ring-2 focus:ring-[#09232d]/10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#09232d] text-xs font-semibold text-white shadow-xs transition hover:bg-[#0c2f3c] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoggingIn ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        Linking account…
                      </>
                    ) : (
                      <>
                        <Send className="size-3.5 text-[#4fd1c5]" />
                        Sign In to Link Account
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Back Link to CRM Leads */}
        <div className="mt-5 text-center">
          <Link
            href="/crm/leads"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-[#09232d]"
          >
            <ArrowLeft className="size-3.5" />
            Return to CRM Leads
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Wrapper used by the sales-engine page: resolves access then renders children or the gate. */
export function SalesEngineAccessShell({ children }: { children: ReactNode }) {
  const { data, isLoading, isFetching, requestAccess, loginLink, refetch } =
    useSalesEngineAccess();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast.success("Access status updated.");
    } catch {
      toast.error("Could not refresh status.");
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading || (!data && isFetching)) {
    return (
      <div className="relative flex min-h-[calc(100vh-80px)] w-full items-center justify-center overflow-hidden bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-[#eef2f6] px-4 py-12">
        <div className="pointer-events-none absolute -top-40 -left-40 h-[450px] w-[450px] rounded-full bg-[#4fd1c5]/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-40 h-[450px] w-[450px] rounded-full bg-[#09232d]/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />

        <div className="relative z-10 w-full max-w-sm rounded-3xl border border-slate-200/90 bg-white/95 p-8 text-center shadow-[0_20px_50px_rgba(9,35,45,0.06),0_1px_3px_rgba(0,0,0,0.03)] backdrop-blur-md">
          <div className="relative mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#09232d] to-[#164455] text-white shadow-lg shadow-[#09232d]/20 ring-4 ring-[#09232d]/5">
            <Loader2 className="size-6 animate-spin text-[#4fd1c5]" />
          </div>
          <h3 className="mt-4 text-base font-bold text-[#09232d]">
            Verifying Access
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Checking Sales Engine workspace permissions…
          </p>
        </div>
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
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing || (isFetching && !isLoading)}
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

