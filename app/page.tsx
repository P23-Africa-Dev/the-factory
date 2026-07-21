"use client";

import { useState } from "react";
import { DownloadAgentAppModal } from "@/components/pwa/DownloadAgentAppModal";
import { getAgentInstallUrl, isMobileDevice } from "@/lib/agent-pwa-url";
import Footer from "@/components/layout/footer";
import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import HeroSectionOption2 from "@/components/landing/HeroSectionOption2";
import FeaturesSection from "@/components/landing/FeaturesSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import PricingSection from "@/components/landing/PricingSection";

export default function Home() {
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [heroOption, setHeroOption] = useState<"option1" | "option2">("option1");

  function handleDownloadAgentApp() {
    if (isMobileDevice()) {
      window.location.href = getAgentInstallUrl();
      return;
    }
    setAgentModalOpen(true);
  }

  function handleToggleHeroOption() {
    setHeroOption((prev) => (prev === "option1" ? "option2" : "option1"));
  }

  return (
    <div className="min-h-screen w-full flex flex-col bg-white font-sans relative">
      {/* Top Header & Navbar with Toggle Icon beside Login */}
      <LandingNavbar
        variant={heroOption === "option2" ? "dark" : "default"}
        heroOption={heroOption}
        onToggleHeroOption={handleToggleHeroOption}
      />

      {/* Hero section toggle container */}
      <div className="flex-grow w-full flex flex-col bg-white">
        {heroOption === "option1" ? (
          <HeroSection onDownloadAgentApp={handleDownloadAgentApp} />
        ) : (
          <HeroSectionOption2 onDownloadAgentApp={handleDownloadAgentApp} />
        )}
      </div>

      {/* Features & Stats grid */}
      <FeaturesSection />

      {/* Pricing packages matrix */}
      <PricingSection />

      {/* Testimonials Quotes carousel */}
      <TestimonialsSection />

      {/* Footer */}
      <div id="p23-africa">
        <Footer />
      </div>

      {/* Download app trigger modal */}
      <DownloadAgentAppModal
        isOpen={agentModalOpen}
        onClose={() => setAgentModalOpen(false)}
      />
    </div>
  );
}
