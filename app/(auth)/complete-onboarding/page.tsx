"use client";

import OnboardingForm from "@/components/forms/onboarding-form";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

function CompleteOnboardingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invitationId] = useState(() => searchParams.get("invitation_id") ?? "");
  const [token] = useState(() => searchParams.get("token") ?? "");

  useEffect(() => {
    if (!invitationId || !token) return;
    // Reduce URL token exposure while preserving in-memory values.
    router.replace("/complete-onboarding");
  }, [invitationId, token, router]);

  return <OnboardingForm invitationId={invitationId} token={token} />;
}

export default function CompleteOnboardingPage() {
  return (
    <div className="w-full max-w-115 flex flex-col gap-8 md:mt-0 lg:-mt-12">
      <div className="text-left md:text-center flex flex-col gap-3">
        <h2 className="text-[32px] sm:text-[36px] font-extrabold leading-10 tracking-[0px] text-[#34373C] mb-2.5">
          Complete your onboarding
        </h2>
        <p className="text-gray-500 text-sm tracking-[0px] leading-5.5 max-w-100 md:mx-auto">
          Review your details and set your password to activate your account.
        </p>
      </div>

      <Suspense fallback={null}>
        <CompleteOnboardingInner />
      </Suspense>
    </div>
  );
}
