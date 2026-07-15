"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import Logo from "@/assets/images/logo.png";
import {
  createCheckoutSession,
  getBillingPlans,
  type BillingPlan,
} from "@/lib/api/billing";
import { ApiRequestError } from "@/lib/api/onboarding";

// Default allocation display (5% of monthly price at 100 credits = $1). The
// server is the source of truth; this is an at-a-glance marketing figure.
const DEFAULT_ALLOCATION_PERCENT = 5;
const DEFAULT_CREDITS_PER_USD = 100;

function includedCredits(plan: BillingPlan): number {
  const dollars = plan.monthly_amount / 100;
  return Math.round(dollars * (DEFAULT_ALLOCATION_PERCENT / 100) * DEFAULT_CREDITS_PER_USD);
}

// Desktop price-cell styling: the price for the currently selected interval is
// emphasized (bold + accent pill) while the other interval is dimmed, so the
// Monthly/Annual toggle visibly changes each plan row.
function priceCellClasses(isActive: boolean, isHovered: boolean): string {
  const base = "inline-block px-3 py-1 rounded-lg transition-all duration-150";
  if (isActive) {
    return `${base} font-bold text-[17px] ${
      isHovered ? "bg-white/15 text-white" : "bg-[#9BDD7C]/20 text-[#0B252C]"
    }`;
  }
  return `${base} font-normal text-[14px] ${
    isHovered ? "text-white/40" : "text-[#0B252C]/35"
  }`;
}

function SubscribePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const [interval, setBillingInterval] = useState<"monthly" | "annual">("monthly");
  const [pendingPlanKey, setPendingPlanKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["billing-plans"],
    queryFn: async () => {
      const response = await getBillingPlans();
      return response.data;
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (plan: BillingPlan) => {
      setPendingPlanKey(plan.key);
      const response = await createCheckoutSession({
        plan_key: plan.key,
        interval,
        context: reason === "expired" ? "renewal" : "onboarding",
      });
      return response.data.checkout_url;
    },
    onSuccess: (checkoutUrl) => {
      window.location.href = checkoutUrl;
    },
    onError: (err) => {
      setPendingPlanKey(null);
      toast.error((err as ApiRequestError).message || "Unable to start checkout.");
    },
  });

  const isExpired = reason === "expired";
  const companyName = data?.billing_status.company_name;
  const isLocked =
    !!data?.billing_status.assigned_plan_key && !data.billing_status.can_choose_plan;
  const canManageBilling = data?.billing_status.can_manage_billing ?? true;
  const viewerRole = data?.billing_status.viewer_role ?? null;

  useEffect(() => {
    if (data && data.billing_status.has_active_subscription) {
      router.replace("/dashboard");
    }
  }, [data, router]);

  const isAnyPending = checkoutMutation.isPending;

  return (
    <div className="min-h-screen bg-[#0B252C] flex flex-col font-sans">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-[#0B252C]/95 backdrop-blur border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src={Logo} alt="Factory 23" width={30} height={30} className="shrink-0" />
            <span className="font-bold text-white text-sm tracking-wide">Factory 23</span>
          </div>
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="text-xs text-white/50 hover:text-white transition"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 w-full px-6 sm:px-12 lg:px-24 py-16 lg:py-20 relative overflow-hidden">
        {/* Decorative background */}
        <div className="absolute inset-y-0 right-0 w-1/4 opacity-10 pointer-events-none hidden lg:block z-0">
          <svg className="w-full h-full text-[#9BDD7C] stroke-current fill-none" viewBox="0 0 300 800" strokeWidth="2">
            {Array.from({ length: 12 }).map((_, i) => {
              const offset = i * 24;
              return <path key={i} d={`M300 ${100 + offset} L${150 + offset / 2} ${250 + offset} L300 ${400 + offset}`} />;
            })}
          </svg>
        </div>

        <div className="max-w-5xl mx-auto flex flex-col items-center relative z-10">
          {/* Hero */}
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40 mb-3">
              {isExpired ? "Renew subscription" : "Subscription"}
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-[40px] font-extrabold text-white tracking-tight">
              {isExpired && companyName
                ? `Renew access for ${companyName}`
                : "Simple, transparent pricing"}
            </h1>
            <p className="text-sm sm:text-base text-gray-300 mt-4 max-w-2xl mx-auto">
              Every plan includes the full Factory 23 platform plus monthly map credits for
              Google-powered search. No contracts. No surprise fees.
            </p>
          </div>

          {isLocked && (
            <div className="mb-8 inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs text-white/90">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
              </svg>
              Your account has been assigned a specific plan — select it below to proceed.
            </div>
          )}

          {/* Interval toggle */}
          {canManageBilling && (
            <div className="flex items-center justify-center mb-10">
              <div className="inline-flex items-center bg-white/10 rounded-full p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setBillingInterval("monthly")}
                  className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                    interval === "monthly" ? "bg-white text-[#0B252C] shadow-sm" : "text-white/60 hover:text-white"
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingInterval("annual")}
                  className={`px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${
                    interval === "annual" ? "bg-white text-[#0B252C] shadow-sm" : "text-white/60 hover:text-white"
                  }`}
                >
                  Annual
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      interval === "annual" ? "bg-[#0B252C]/10 text-[#0B252C]" : "bg-emerald-400/20 text-emerald-300"
                    }`}
                  >
                    Save 17%
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Contact-admin notice for non-billing roles */}
          {!isLoading && data && !canManageBilling && (
            <div className="w-full max-w-[900px] rounded-2xl border border-amber-300/40 bg-amber-50 px-6 py-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.01M4.93 19h14.14A2 2 0 0021 17.24V6.76A2 2 0 0019.07 5H4.93A2 2 0 003 6.76v10.48A2 2 0 004.93 19z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-semibold text-amber-900">
                    Your organization needs an active subscription
                  </h2>
                  <p className="mt-1 text-sm text-amber-800 leading-6">
                    {companyName ? (
                      <>
                        <span className="font-semibold">{companyName}</span> doesn&rsquo;t have an
                        active subscription right now, so dashboard access is paused for everyone.
                      </>
                    ) : (
                      <>Your workspace doesn&rsquo;t have an active subscription right now.</>
                    )}
                  </p>
                  <p className="mt-3 text-sm text-amber-800 leading-6">
                    Only the workspace <span className="font-semibold">owner</span> or an{" "}
                    <span className="font-semibold">admin</span> can start or renew the subscription
                    {viewerRole ? (
                      <> (you&rsquo;re signed in as <span className="font-semibold">{viewerRole}</span>).</>
                    ) : (
                      <>.</>
                    )}{" "}
                    Please contact them to restore access.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Desktop pricing table */}
          {(isLoading || canManageBilling) && (
            <div className="hidden md:block w-full max-w-[900px] bg-white rounded-[32px] p-8 lg:p-10 shadow-2xl">
              <div className="flex justify-end mb-2">
                <span className="bg-[#C56C39] text-white text-[13px] font-medium px-4 py-2 rounded-lg inline-block shadow-sm">
                  Annual billing saves you 17%
                </span>
              </div>

              <div className="grid grid-cols-12 gap-4 pb-4 border-b border-gray-100 items-end px-2">
                <div className="col-span-5 text-left">
                  <h3 className="text-[26px] font-bold text-[#0B252C] leading-none mb-1">Team Size</h3>
                  <p className="text-[13px] text-[#4A5F64]">Includes monthly map credits for Google search.</p>
                </div>
                <div className={`col-span-2 text-center transition-all ${interval === "monthly" ? "" : "opacity-40"}`}>
                  <span className="text-[15px] text-[#0B252C] font-semibold">Monthly</span>
                  <span
                    className={`block h-0.5 w-8 mx-auto mt-1 rounded-full transition-all ${
                      interval === "monthly" ? "bg-[#9BDD7C]" : "bg-transparent"
                    }`}
                  />
                </div>
                <div className={`col-span-2 text-center transition-all ${interval === "annual" ? "" : "opacity-40"}`}>
                  <span className="text-[15px] text-[#0B252C] font-semibold block leading-tight">Annual</span>
                  <span className="text-[12px] text-[#4A5F64] block leading-tight">(2 months free)</span>
                  <span
                    className={`block h-0.5 w-8 mx-auto mt-1 rounded-full transition-all ${
                      interval === "annual" ? "bg-[#9BDD7C]" : "bg-transparent"
                    }`}
                  />
                </div>
                <div className="col-span-3 text-right" />
              </div>

              <div className="flex flex-col mt-4">
                {isLoading ? (
                  <div className="py-12 text-center text-sm text-gray-400">Loading plans…</div>
                ) : error ? (
                  <div className="py-12 text-center text-sm text-red-500">
                    Unable to load plans. Please refresh and try again.
                  </div>
                ) : (
                  data?.plans.map((plan) => {
                    const isHovered = hoveredKey === plan.key;
                    const isPending = isAnyPending && pendingPlanKey === plan.key;
                    const isAvailable =
                      interval === "monthly"
                        ? plan.monthly_available ?? true
                        : plan.annual_available ?? true;
                    return (
                      <div
                        key={plan.key}
                        onMouseEnter={() => setHoveredKey(plan.key)}
                        onMouseLeave={() => setHoveredKey(null)}
                        className={`relative group ${isAvailable ? "cursor-pointer" : "cursor-not-allowed"}`}
                        onClick={() => isAvailable && !isAnyPending && checkoutMutation.mutate(plan)}
                      >
                        <div
                          className={`absolute inset-y-0 left-[-16px] lg:left-[-24px] right-[-16px] md:right-[-48px] lg:right-[-80px] rounded-[16px] transition-all duration-150 z-0 ${
                            isHovered ? "bg-[#1E5A69] shadow-lg" : "bg-transparent"
                          }`}
                        />
                        <div className="grid grid-cols-12 gap-4 items-center py-4 px-2 relative z-10">
                          <div className="col-span-5 text-left">
                            <span className={`text-[16px] font-medium block ${isHovered ? "text-white" : "text-[#0B252C]"}`}>
                              {plan.label}
                            </span>
                            <span className={`text-[12px] ${isHovered ? "text-white/70" : "text-[#4A5F64]"}`}>
                              ≈ {includedCredits(plan).toLocaleString()} map credits/mo
                            </span>
                          </div>
                          <div className="col-span-2 flex justify-center">
                            <span className={priceCellClasses(interval === "monthly", isHovered)}>
                              {plan.monthly_amount_display}
                            </span>
                          </div>
                          <div className="col-span-2 flex justify-center">
                            <span className={priceCellClasses(interval === "annual", isHovered)}>
                              {plan.annual_amount_display}
                            </span>
                          </div>
                          <div className="col-span-3 text-right">
                            <button
                              type="button"
                              disabled={isAnyPending || !isAvailable}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isAvailable) {
                                  checkoutMutation.mutate(plan);
                                }
                              }}
                              className={`px-6 py-2.5 text-[14px] font-medium rounded-lg transition-all shadow-sm inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
                                !isAvailable
                                  ? "bg-[#F4F7F6] text-[#A0AAB0]"
                                  : isHovered
                                    ? "bg-gradient-to-r from-[#A7E88A] to-[#92D774] text-[#0B252C] cursor-pointer"
                                    : "bg-[#F4F7F6] text-[#A0AAB0] hover:bg-gray-200 cursor-pointer"
                              }`}
                            >
                              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              {!isAvailable ? "Unavailable" : isPending ? "Redirecting…" : "Choose plan"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Mobile stacked cards */}
          {canManageBilling && !isLoading && !error && (
            <div className="md:hidden w-full flex flex-col gap-4">
              <div className="text-center mb-1">
                <span className="bg-[#C56C39] text-white text-[12px] font-bold px-4 py-2 rounded-lg inline-block shadow-sm">
                  Annual billing saves you 17%
                </span>
              </div>
              {data?.plans.map((plan) => {
                const isPending = isAnyPending && pendingPlanKey === plan.key;
                const isAvailable =
                  interval === "monthly"
                    ? plan.monthly_available ?? true
                    : plan.annual_available ?? true;
                return (
                  <div key={plan.key} className="w-full rounded-2xl border border-white/10 bg-white p-5 flex flex-col gap-4 text-[#0B252C]">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-bold text-lg block">{plan.label}</span>
                        <span className="text-[12px] text-[#4A5F64]">
                          ≈ {includedCredits(plan).toLocaleString()} map credits/mo
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 py-1">
                      <div
                        className={`rounded-xl p-3 transition-all ${
                          interval === "monthly" ? "bg-[#9BDD7C]/15 ring-1 ring-[#9BDD7C]" : "opacity-45"
                        }`}
                      >
                        <span className="text-[11px] uppercase tracking-wider opacity-60 block">Monthly</span>
                        <span className="text-xl font-extrabold">{plan.monthly_amount_display}</span>
                        <span
                          className={`text-[10px] font-semibold text-emerald-700 block mt-0.5 ${
                            interval === "monthly" ? "" : "invisible"
                          }`}
                        >
                          Selected
                        </span>
                      </div>
                      <div
                        className={`rounded-xl p-3 transition-all ${
                          interval === "annual" ? "bg-[#9BDD7C]/15 ring-1 ring-[#9BDD7C]" : "opacity-45"
                        }`}
                      >
                        <span className="text-[11px] uppercase tracking-wider opacity-60 block">Annual</span>
                        <span className="text-xl font-extrabold">{plan.annual_amount_display}</span>
                        <span
                          className={`text-[10px] font-semibold text-emerald-700 block mt-0.5 ${
                            interval === "annual" ? "" : "invisible"
                          }`}
                        >
                          Selected
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isAnyPending || !isAvailable}
                      onClick={() => isAvailable && checkoutMutation.mutate(plan)}
                      className={`w-full py-3 text-sm font-bold rounded-[10px] transition-all shadow-sm inline-flex items-center justify-center gap-2 ${
                        isAvailable
                          ? "cursor-pointer bg-[#9BDD7C] text-[#0B252C] disabled:opacity-60"
                          : "cursor-not-allowed bg-[#F4F7F6] text-[#A0AAB0]"
                      }`}
                    >
                      {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      {!isAvailable
                        ? "Unavailable"
                        : isPending
                          ? "Redirecting…"
                          : `Choose ${interval} plan`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-center text-xs text-white/40 pt-10">
            Payments are processed securely via Stripe. You can manage or cancel your subscription at any time.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function SubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0B252C] flex items-center justify-center text-sm text-white/50">
          Loading plans…
        </div>
      }
    >
      <SubscribePageInner />
    </Suspense>
  );
}
