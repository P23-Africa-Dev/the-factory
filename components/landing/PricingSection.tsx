"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const pricingPlans = [
  {
    key: "up_to_5",
    price: { monthly: 99, yearly: 79 },
    users: "Up to 5 users",
    description: "Perfect for startups and small field teams looking to streamline operations, manage customer relationships, and track field activities efficiently.",
    featured: false,
  },
  {
    key: "up_to_10",
    price: { monthly: 199, yearly: 159 },
    users: "Up to 10 users",
    description: "Designed for growing teams that require better visibility, collaboration, and operational control across multiple field activities.",
    featured: false,
  },
  {
    key: "up_to_15",
    price: { monthly: 279, yearly: 229 },
    users: "Up to 15 users",
    description: "Ideal for expanding businesses managing larger field operations, customer pipelines, and performance-driven teams.",
    featured: true,
  },
  {
    key: "up_to_20",
    price: { monthly: 319, yearly: 259 },
    users: "Up to 20 users",
    description: "Built for organizations requiring advanced operational oversight, team coordination, and scalable field intelligence.",
    featured: false,
  },
];

const pricingFeatures = [
  "Field Operations Management",
  "CRM & Customer Management",
  "KPI & Performance Tracking",
  "AI Assistant (ELY)",
  "Business Intelligence & Maps",
];

export default function PricingSection() {
  const [billingYearly, setBillingYearly] = useState(false);
  const router = useRouter();

  const handleChoosePlan = (planKey: string) => {
    const interval = billingYearly ? "annual" : "monthly";
    router.push(`/register?plan=${planKey}&interval=${interval}`);
  };

  return (
    <section id="pricing" className="w-full bg-[#133139] py-20 lg:py-28 px-6 sm:px-12 lg:px-24 font-sans relative overflow-hidden">
      {/* Geometric hexagon background decoration — static SVG avoids React SVG prop warnings */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/landing/pricing-hexagons.svg"
        alt=""
        aria-hidden="true"
        className="absolute right-0 top-0 h-full w-auto pointer-events-none z-0 select-none hidden md:block"
      />

      <div className="max-w-5xl mx-auto flex flex-col items-center gap-10 relative z-10">

        {/* Header */}
        <div className="text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-white tracking-tight">
            Simple, transparent pricing
          </h2>
          <p className="text-sm sm:text-base text-white/60 mt-3">
            No contracts. No surprise fees.
          </p>
        </div>

        {/* Monthly / Yearly Toggle */}
        <div className="flex items-center gap-1 bg-white/10 rounded-full p-1">
          <button
            onClick={() => setBillingYearly(false)}
            className={`px-6 py-2.5 rounded-full text-xs font-bold tracking-widest uppercase transition-all cursor-pointer ${
              !billingYearly
                ? "bg-[#1E5A69] text-white shadow-sm"
                : "text-white/60 hover:text-white"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingYearly(true)}
            className={`px-6 py-2.5 rounded-full text-xs font-bold tracking-widest uppercase transition-all cursor-pointer ${
              billingYearly
                ? "bg-white text-[#133139] shadow-sm"
                : "text-white/60 hover:text-white"
            }`}
          >
            Yearly
          </button>
        </div>

        {/* Pricing Cards Container */}
        <div className="w-full bg-white rounded-[28px] shadow-2xl p-6 lg:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
            {pricingPlans.map((plan, idx) => (
              <div
                key={idx}
                className={`relative flex flex-col rounded-[20px] p-6 transition-all duration-300 ${
                  plan.featured
                    ? "bg-[#133139] text-white shadow-xl scale-[1.03] z-10"
                    : "bg-white text-[#0B252C] border border-gray-100"
                }`}
              >
                {/* Most Popular Badge */}
                {plan.featured && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-[#C56C39] text-white text-[11px] font-bold px-4 py-1.5 rounded-full uppercase tracking-wider whitespace-nowrap shadow-md">
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Price */}
                <div className="mb-1 mt-3">
                  <span className={`text-4xl font-extrabold tracking-tight ${plan.featured ? "text-white" : "text-[#0B252C]"}`}>
                    ${billingYearly ? plan.price.yearly : plan.price.monthly}
                  </span>
                  <span className={`text-sm font-medium ml-1 ${plan.featured ? "text-white/70" : "text-[#4A5F64]"}`}>
                    /month
                  </span>
                </div>

                {/* Users */}
                <h3 className={`text-lg font-extrabold mb-3 ${plan.featured ? "text-white" : "text-[#0B252C]"}`}>
                  {plan.users}
                </h3>

                {/* Description */}
                <p className={`text-xs leading-relaxed mb-5 ${plan.featured ? "text-white/70" : "text-[#4A5F64]"}`}>
                  {plan.description}
                </p>

                {/* Feature list */}
                <ul className="flex flex-col gap-2.5 mb-6 flex-1">
                  {pricingFeatures.map((feature, fi) => (
                    <li key={fi} className="flex items-center gap-2.5">
                      <svg
                        viewBox="0 0 16 16"
                        className={`w-4 h-4 shrink-0 ${
                          plan.featured ? "text-[#9BDD7C]" : "text-[#82C341]"
                        }`}
                        fill="currentColor"
                      >
                        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                      </svg>
                      <span className={`text-xs font-medium ${plan.featured ? "text-white/90" : "text-[#0B252C]"}`}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <button
                  onClick={() => handleChoosePlan(plan.key)}
                  className={`w-full py-3 rounded-[12px] text-sm font-bold transition-all active:scale-[0.98] cursor-pointer ${
                    plan.featured
                      ? "bg-[#9BDD7C] text-[#0B252C] hover:bg-[#8fd16e] shadow-lg"
                      : "bg-[#F0F7EC] text-[#4A5F64] hover:bg-[#9BDD7C]/30 hover:text-[#0B252C]"
                  }`}
                >
                  Choose plan
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* View All Plans CTA */}
        <Link href="/subscribe">
          <button className="px-8 py-3.5 bg-[#B35E31] text-white text-sm font-bold rounded-full shadow-lg hover:bg-[#9e5229] active:scale-[0.98] transition-all cursor-pointer">
            View All Available Plans
          </button>
        </Link>

      </div>
    </section>
  );
}
