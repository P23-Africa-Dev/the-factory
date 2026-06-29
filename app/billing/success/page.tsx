"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getBillingStatus } from "@/lib/api/billing";
import Button from "@/components/ui/button";

function BillingSuccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Confirming your payment...");

  useEffect(() => {
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      try {
        const response = await getBillingStatus();
        if (response.data.has_active_subscription) {
          setMessage("Payment confirmed. Redirecting to your dashboard...");
          window.setTimeout(() => router.replace("/dashboard"), 1200);
          return;
        }
      } catch {
        // keep polling briefly
      }

      if (attempts < 8) {
        window.setTimeout(poll, 1500);
      } else {
        setMessage("Payment received. If your dashboard is not available yet, please wait a moment and refresh.");
      }
    };

    if (searchParams.get("session_id")) {
      poll();
    } else {
      setMessage("Missing checkout session. Returning to plans...");
      window.setTimeout(() => router.replace("/subscribe"), 1500);
    }
  }, [router, searchParams]);

  return (
    <div className="w-full max-w-lg mx-auto text-center flex flex-col gap-6 py-16">
      <h1 className="text-2xl font-bold text-gray-900">Processing payment</h1>
      <p className="text-gray-600">{message}</p>
      <Button type="button" onClick={() => router.push("/dashboard")}>
        Go to dashboard
      </Button>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center">Loading...</div>}>
      <BillingSuccessInner />
    </Suspense>
  );
}
