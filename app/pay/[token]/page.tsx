"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import Button from "@/components/ui/button";
import { checkoutFromPaymentLink, getPaymentLinkInfo } from "@/lib/api/billing";
import { ApiRequestError } from "@/lib/api/onboarding";

export default function PaymentLinkPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const { data, isLoading, error } = useQuery({
    queryKey: ["payment-link", token],
    queryFn: async () => {
      const response = await getPaymentLinkInfo(token);
      return response.data;
    },
    enabled: Boolean(token),
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const response = await checkoutFromPaymentLink(token);
      return response.data.checkout_url;
    },
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (err) => {
      toast.error((err as ApiRequestError).message || "Unable to start checkout.");
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#6FA8A6] text-white">
        Loading payment details...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#6FA8A6] px-6">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Payment link unavailable</h1>
          <p className="text-gray-600">This link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#6FA8A6] px-6 py-10">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-lg flex flex-col gap-5">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-400">Factory 23</p>
          <h1 className="text-2xl font-extrabold text-gray-900 mt-2">{data.company_name}</h1>
          <p className="text-sm text-gray-500 mt-1">Company ID: {data.public_company_id}</p>
        </div>

        {data.already_paid ? (
          <p className="text-green-700 bg-green-50 rounded-lg p-4 text-sm">
            This account already has an active subscription. You can continue onboarding without
            making another payment.
          </p>
        ) : (
          <>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-sm text-gray-500">Selected plan</p>
              <p className="text-lg font-semibold text-gray-900">{data.plan_label}</p>
              <p className="text-sm text-gray-600 capitalize">
                {data.billing_interval} billing · {data.amount_display}
              </p>
            </div>
            <Button
              type="button"
              disabled={checkoutMutation.isPending}
              onClick={() => checkoutMutation.mutate()}
            >
              {checkoutMutation.isPending ? "Redirecting..." : "Continue to secure payment"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
