"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { getMapCredits } from "@/lib/api/map-credits";
import Button from "@/components/ui/button";

function CreditSuccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Confirming your top-up...");
  const [balance, setBalance] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const baselineRef = useRef<number | null>(null);

  useEffect(() => {
    let attempts = 0;
    let cancelled = false;

    const poll = async () => {
      attempts += 1;
      try {
        const response = await getMapCredits();
        const current = response.data.balance;
        if (cancelled) return;
        setBalance(current);

        // Credits arrive via webhook shortly after checkout; wait for an increase.
        if (baselineRef.current === null) {
          baselineRef.current = current;
        } else if (current > baselineRef.current) {
          setMessage("Top-up confirmed! Your credits have been added.");
          setDone(true);
          window.setTimeout(() => router.replace("/settings/map-credits"), 1800);
          return;
        }
      } catch {
        // keep polling briefly
      }

      if (!cancelled) {
        if (attempts < 10) {
          window.setTimeout(poll, 1800);
        } else {
          setMessage(
            "Payment received. Your credits will appear shortly — you can safely return to settings.",
          );
          setDone(true);
        }
      }
    };

    if (searchParams.get("session_id")) {
      poll();
    } else {
      setMessage("Missing checkout session. Returning to settings...");
      window.setTimeout(() => router.replace("/settings/map-credits"), 1500);
    }

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center flex flex-col items-center gap-5 py-16">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center ${
            done ? "bg-green-500/10" : "bg-gray-100"
          }`}
        >
          {done ? (
            <CheckCircle2 size={32} className="text-green-600" />
          ) : (
            <Loader2 size={30} className="animate-spin text-gray-400" />
          )}
        </div>
        <h1 className="text-2xl font-black text-dash-dark">
          {done ? "All set" : "Processing top-up"}
        </h1>
        <p className="text-[14px] text-gray-500">{message}</p>
        {balance !== null && (
          <p className="text-[15px] font-semibold text-dash-dark">
            Current balance: {balance.toLocaleString()} credits
          </p>
        )}
        <Button type="button" onClick={() => router.push("/settings/map-credits")}>
          Back to map credits
        </Button>
      </div>
    </div>
  );
}

export default function CreditSuccessPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center">Loading...</div>}>
      <CreditSuccessInner />
    </Suspense>
  );
}
