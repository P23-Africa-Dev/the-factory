"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import Logo from "@/assets/images/logo.png";
import {
  createCheckoutSession,
  getBillingPlans,
  type BillingPlan,
} from "@/lib/api/billing";
import { ApiRequestError } from "@/lib/api/onboarding";

const FEATURES = [
  "Real-time GPS tracking",
  "Attendance & check-in",
  "Task management",
  "Territory assignment",
  "Live dashboard",
  "AI field reporting",
  "AI insights",
  "Automated reports",
  "Payroll summary",
  "Commission tracking",
  "Offline mode",
  "Supervisor dashboard",
  "Mobile app",
];

function SubscribePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [pendingPlanKey, setPendingPlanKey] = useState<string | null>(null);

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

  useEffect(() => {
    if (data && data.billing_status.billing_enforced === false) {
      router.replace("/dashboard");
    }
  }, [data, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Sticky header ─────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src={Logo} alt="Factory 23" width={28} height={28} className="shrink-0" />
            <span className="font-bold text-[#1F4F4E] text-sm tracking-wide">Factory 23</span>
          </div>
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="text-xs text-gray-400 hover:text-gray-600 transition"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 flex flex-col gap-7">
        {/* ── Hero ──────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-[#1F4F4E] text-white px-7 py-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50 mb-2">
            Subscription
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold leading-snug">
            {isExpired && companyName
              ? `Renew access for ${companyName}`
              : "Choose the right plan for your team"}
          </h1>
          <p className="mt-2 text-sm text-white/70 max-w-2xl leading-6">
            Every plan includes the full Factory 23 platform: GPS tracking, attendance,
            tasks, AI reporting, payroll, offline mode and more.
          </p>

          {isLocked && (
            <div className="mt-4 inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs text-white/90">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
              </svg>
              Your account has been assigned a specific plan — select it below to proceed.
            </div>
          )}
        </div>

        {/* ── Billing interval toggle ───────────────────────────── */}
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center bg-gray-100 rounded-full p-1 gap-1">
            <button
              type="button"
              onClick={() => setInterval("monthly")}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${interval === "monthly"
                ? "bg-[#1F4F4E] text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700"
                }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setInterval("annual")}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${interval === "annual"
                ? "bg-[#1F4F4E] text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700"
                }`}
            >
              Annual
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${interval === "annual"
                  ? "bg-white/20 text-white"
                  : "bg-emerald-100 text-emerald-700"
                  }`}
              >
                Save 17%
              </span>
            </button>
          </div>
        </div>

        {/* ── Plans table ───────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center bg-gray-50 border-b border-gray-200 px-5 py-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Team size
            </div>
            <div className="w-28 text-center text-xs font-semibold uppercase tracking-wider text-gray-400 hidden sm:block">
              Monthly
            </div>
            <div className="w-28 text-center text-xs font-semibold uppercase tracking-wider text-gray-400 hidden sm:block">
              Annual
            </div>
            <div className="w-36" />
          </div>

          {/* Rows */}
          {isLoading ? (
            <div className="py-12 text-center text-sm text-gray-400">Loading plans…</div>
          ) : error ? (
            <div className="py-12 text-center text-sm text-red-500">
              Unable to load plans. Please refresh and try again.
            </div>
          ) : (
            data?.plans.map((plan, i) => {
              const isPending =
                checkoutMutation.isPending && pendingPlanKey === plan.key;
              const isAnyPending = checkoutMutation.isPending;
              const price =
                interval === "monthly"
                  ? plan.monthly_amount_display
                  : plan.annual_amount_display;

              return (
                <div
                  key={plan.key}
                  className={`grid grid-cols-[1fr_auto_auto_auto] items-center px-5 py-3.5 gap-3 transition-colors ${i > 0 ? "border-t border-gray-100" : ""
                    } ${isAnyPending && !isPending ? "opacity-50" : ""}`}
                >
                  {/* Plan label */}
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{plan.label}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5 sm:hidden">
                      {price}/{interval === "monthly" ? "mo" : "yr"}
                    </p>
                  </div>

                  {/* Monthly price */}
                  <div className="w-28 text-center hidden sm:block">
                    <span className="font-semibold text-gray-800 text-sm">
                      {plan.monthly_amount_display}
                    </span>
                    <span className="text-[11px] text-gray-400">/mo</span>
                  </div>

                  {/* Annual price */}
                  <div className="w-28 text-center hidden sm:block">
                    <span className="font-semibold text-gray-800 text-sm">
                      {plan.annual_amount_display}
                    </span>
                    <span className="text-[11px] text-gray-400">/yr</span>
                  </div>

                  {/* CTA */}
                  <div className="w-36">
                    <button
                      type="button"
                      disabled={isAnyPending}
                      onClick={() => checkoutMutation.mutate(plan)}
                      className={`w-full text-sm font-semibold rounded-lg px-4 py-2 transition-all ${isPending
                        ? "bg-[#1F4F4E] text-white opacity-80 cursor-wait"
                        : "bg-[#1F4F4E] text-white hover:bg-[#163b3a] active:scale-[0.98]"
                        } disabled:cursor-not-allowed`}
                    >
                      {isPending ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                          Redirecting…
                        </span>
                      ) : (
                        `Subscribe`
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Selected interval callout ─────────────────────────── */}
        {interval === "annual" && (
          <div className="flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-100 px-5 py-4 text-sm text-emerald-800">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <p>
              <span className="font-semibold">Annual billing saves 17%.</span> Pay once for the
              whole year and get 2 months free, predictable budgeting, and priority onboarding.
            </p>
          </div>
        )}

        {/* ── Features ─────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-200 bg-white px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">
            Included in every plan
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2.5">
            {FEATURES.map((feature) => (
              <div key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                <svg className="w-3.5 h-3.5 shrink-0 text-[#1F4F4E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {feature}
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer note ───────────────────────────────────────── */}
        <p className="text-center text-xs text-gray-400 pb-2">
          Payments are processed securely via Stripe. You can manage or cancel your subscription at any time.
        </p>
      </main>
    </div>
  );
}

export default function SubscribePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-400">
        Loading plans…
      </div>
    }>
      <SubscribePageInner />
    </Suspense>
  );
}
