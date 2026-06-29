"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import Button from "@/components/ui/button";
import {
  createCheckoutSession,
  getBillingPlans,
  type BillingPlan,
} from "@/lib/api/billing";
import { ApiRequestError } from "@/lib/api/onboarding";

const FEATURES = [
  "Real-time GPS tracking",
  "Attendance and check-in",
  "Task management",
  "Territory assignment",
  "Live dashboard",
  "AI field reporting & AI insights",
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

  const { data, isLoading, error } = useQuery({
    queryKey: ["billing-plans"],
    queryFn: async () => {
      const response = await getBillingPlans();
      return response.data;
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (plan: BillingPlan) => {
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
      const error = err as ApiRequestError;
      toast.error(error.message || "Unable to start checkout.");
    },
  });

  const companyName = data?.billing_status.company_name ?? "Your business";
  const isExpired = reason === "expired";

  const title = useMemo(() => {
    if (isExpired) {
      return `Renew subscription for ${companyName}`;
    }
    return "Choose your plan";
  }, [companyName, isExpired]);

  if (error) {
    return (
      <div className="w-full max-w-4xl mx-auto py-8 text-center text-red-500">
        Unable to load plans. Please refresh and try again.
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-8 py-4">
      <div className="rounded-2xl bg-[#1F4F4E] text-white p-8 md:p-10">
        <p className="text-sm uppercase tracking-[0.2em] text-white/70 mb-3">Factory 23</p>
        <h1 className="text-3xl md:text-4xl font-extrabold leading-tight mb-4">{title}</h1>
        <p className="text-white/80 max-w-2xl text-sm md:text-base leading-6">
          Real-time visibility for field teams in Africa. Every plan includes the full platform —
          tracking, attendance, tasks, AI reporting, payroll, and more.
        </p>
        {data?.billing_status.assigned_plan_key && !data.billing_status.can_choose_plan ? (
          <p className="mt-4 text-sm text-[#B7E4E2]">
            Your account has been assigned a specific plan. Select it below to continue.
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setInterval("monthly")}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
            interval === "monthly"
              ? "bg-[#1F4F4E] text-white"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setInterval("annual")}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
            interval === "annual"
              ? "bg-[#1F4F4E] text-white"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          Annual (2 months free)
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.4fr_1fr_1fr] bg-gray-50 px-6 py-4 text-sm font-semibold text-gray-600">
          <div>Team size</div>
          <div className="text-center">Monthly</div>
          <div className="text-center">Annual</div>
        </div>

        {isLoading ? (
          <div className="px-6 py-10 text-center text-gray-500">Loading plans...</div>
        ) : (
          data?.plans.map((plan) => {
            const price =
              interval === "monthly"
                ? plan.monthly_amount_display
                : plan.annual_amount_display;

            return (
              <div
                key={plan.key}
                className="grid grid-cols-[1.4fr_1fr_1fr] items-center border-t border-gray-100 px-6 py-4 gap-4"
              >
                <div>
                  <p className="font-semibold text-gray-900">{plan.label}</p>
                  <p className="text-xs text-gray-500">All features included</p>
                </div>
                <div className="text-center font-semibold text-gray-800">
                  {plan.monthly_amount_display}
                </div>
                <div className="text-center font-semibold text-gray-800">
                  {plan.annual_amount_display}
                </div>
                <div className="col-span-3 flex justify-end">
                  <Button
                    type="button"
                    disabled={checkoutMutation.isPending}
                    onClick={() => checkoutMutation.mutate(plan)}
                  >
                    {checkoutMutation.isPending
                      ? "Redirecting..."
                      : `Subscribe ${price}/${interval === "monthly" ? "mo" : "yr"}`}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Included in every plan</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
          {FEATURES.map((feature) => (
            <div key={feature} className="flex items-center gap-2">
              <span className="text-[#1F4F4E]">✓</span>
              <span>{feature}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-gray-500">
          Annual billing saves you 17%. Pay annually for two months free, predictable budgeting,
          and priority onboarding.
        </p>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          className="text-sm text-gray-500 hover:text-gray-700"
          onClick={() => router.push("/login")}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function SubscribePage() {
  return (
    <Suspense fallback={<div className="py-16 text-center">Loading...</div>}>
      <SubscribePageInner />
    </Suspense>
  );
}
