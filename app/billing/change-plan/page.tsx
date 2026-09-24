"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  changeBillingPlan,
  createCheckoutSession,
  getBillingPlans,
  type BillingPlan,
} from "@/lib/api/billing";
import { ApiRequestError } from "@/lib/api/onboarding";
import { getAuthTokenFromDocument } from "@/lib/auth/session";

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

export default function ChangePlanPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const hasToken = Boolean(getAuthTokenFromDocument());

  const { data, isLoading, error } = useQuery({
    queryKey: ["billing-plans"],
    queryFn: async () => {
      const response = await getBillingPlans();
      return response.data;
    },
    enabled: hasToken,
  });

  const status = data?.billing_status;
  const plans = useMemo(() => {
    const list = data?.plans ?? [];
    return [...list].sort((a, b) => a.seat_limit - b.seat_limit);
  }, [data?.plans]);

  const usedSeats = status?.seat_usage.used ?? 0;
  const currentPlanKey = status?.plan_key ?? null;
  const canChoose = status?.can_choose_plan ?? true;
  const canManage = status?.can_manage_billing ?? false;
  const hasStripeSub = Boolean(status?.has_active_stripe_subscription);

  const mutation = useMutation({
    mutationFn: async (plan: BillingPlan) => {
      setPendingKey(plan.key);

      if (hasStripeSub) {
        const response = await changeBillingPlan({
          plan_key: plan.key,
          interval,
        });
        return { mode: "swap" as const, data: response.data };
      }

      const response = await createCheckoutSession({
        plan_key: plan.key,
        interval,
        context: "upgrade",
      });
      return { mode: "checkout" as const, checkoutUrl: response.data.checkout_url };
    },
    onSuccess: async (result) => {
      if (result.mode === "checkout") {
        window.location.href = result.checkoutUrl;
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["billing-status"] });
      await queryClient.invalidateQueries({ queryKey: ["billing-plans"] });
      toast.success("Plan updated successfully.");
      router.push("/settings/billing");
    },
    onError: (err) => {
      setPendingKey(null);
      toast.error((err as ApiRequestError).message || "Unable to change plan.");
    },
  });

  if (!hasToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <p className="text-sm text-gray-600">Please sign in to manage your plan.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link
          href="/settings/billing"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-600 hover:text-dash-dark mb-6"
        >
          <ArrowLeft size={14} />
          Back to billing
        </Link>

        <h1 className="text-2xl font-bold text-dash-dark">Change plan</h1>
        <p className="text-[14px] text-gray-500 mt-1">
          Upgrade for more seats, or switch intervals. Your current usage:{" "}
          <span className="font-semibold text-dash-dark">
            {usedSeats}
            {status?.seat_usage.limit != null ? ` / ${status.seat_usage.limit}` : ""} seats
          </span>
        </p>

        {isLoading && (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-gray-400" size={28} />
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-red-100 bg-red-50 p-4 text-[13px] text-red-700">
            {(error as Error).message || "Unable to load plans."}
          </div>
        )}

        {!isLoading && !error && !canManage && (
          <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50 p-4 text-[13px] text-amber-800">
            Contact your workspace owner or admin to change the plan.
          </div>
        )}

        {!isLoading && !error && canManage && !canChoose && (
          <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50 p-4 text-[13px] text-amber-800">
            Your plan is managed by Factory23. Contact support to change seats.
          </div>
        )}

        {!isLoading && !error && canManage && canChoose && (
          <>
            <div className="mt-6 inline-flex rounded-xl border border-gray-200 bg-white p-1">
              {(["monthly", "annual"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setInterval(value)}
                  className={`px-4 py-2 rounded-lg text-[13px] font-semibold capitalize transition ${
                    interval === value
                      ? "bg-dash-dark text-white"
                      : "text-gray-600 hover:text-dash-dark"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-3">
              {plans.map((plan) => {
                const isCurrent = plan.key === currentPlanKey;
                const tooSmall = plan.seat_limit < usedSeats;
                const available =
                  interval === "monthly"
                    ? plan.monthly_available !== false
                    : plan.annual_available !== false;
                const price =
                  interval === "monthly" ? plan.monthly_amount : plan.annual_amount;
                const disabled =
                  tooSmall || !available || mutation.isPending || isCurrent;

                return (
                  <div
                    key={plan.key}
                    className={`rounded-2xl border bg-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 ${
                      isCurrent ? "border-dash-dark" : "border-gray-200"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[15px] font-bold text-dash-dark">{plan.label}</p>
                        {isCurrent && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-dash-dark text-white">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] text-gray-500 mt-0.5">
                        Up to {plan.seat_limit} users
                        {tooSmall ? " · Remove team members before switching" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4">
                      <p className="text-[16px] font-bold text-dash-dark whitespace-nowrap">
                        {formatMoney(price)}
                        <span className="text-[12px] font-medium text-gray-400">
                          /{interval === "monthly" ? "mo" : "yr"}
                        </span>
                      </p>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => mutation.mutate(plan)}
                        className="inline-flex items-center justify-center gap-1.5 min-w-[120px] px-4 py-2.5 rounded-xl bg-dash-dark text-white text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {pendingKey === plan.key && mutation.isPending ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : isCurrent ? (
                          <>
                            <Check size={14} /> Current
                          </>
                        ) : tooSmall ? (
                          "Too small"
                        ) : hasStripeSub ? (
                          "Switch"
                        ) : (
                          "Checkout"
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {!hasStripeSub && (
              <p className="mt-4 text-[12px] text-gray-500">
                You will complete a secure Stripe checkout to activate the selected plan.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
