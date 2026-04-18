"use client";

import OnboardingForm from "@/components/forms/onboarding-form";
import { useEffect, useState } from "react";

export default function CompleteOnboardingPage() {
  const [name, setName] = useState(() => 
    typeof window !== "undefined" ? sessionStorage.getItem("onboarding_name") ?? "" : ""
  );

  return (
    <div className="w-full max-w-115 flex flex-col gap-8 md:mt-0 lg:-mt-12">
      <div className="text-left md:text-center flex flex-col gap-3">
        <h2 suppressHydrationWarning className="text-[32px] sm:text-[36px] font-extrabold leading-10 tracking-[0px] text-[#34373C] mb-2.5">
          Welcome{name ? `, ${name}` : ""}
        </h2>
        <p className="text-gray-500 text-sm tracking-[0px] leading-5.5 max-w-100 md:mx-auto">
          Tell us a bit about your workspace to get started.
        </p>
        <p className="text-[#34373C] text-sm font-bold tracking-[0px] leading-5.5 max-w-100 md:mx-auto">
          Create a Workspace
        </p>
      </div>

      <OnboardingForm />
    </div>
  );
}
